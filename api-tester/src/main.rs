use actix_web::{web, App, HttpServer, HttpResponse, get};
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use tokio_tungstenite::connect_async;
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;
use futures_util::{SinkExt, StreamExt};
use log::{info, error};
use moka::future::Cache;
use chrono::Utc;
use lazy_static::lazy_static;
use prometheus::{
    IntCounter, IntGauge, Histogram,
    IntCounterVec, register_int_counter_vec, register_histogram, 
    register_int_counter, register_int_gauge
};
use url::Url;

lazy_static! {
    static ref HTTP_REQUESTS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "http_requests_total",
        "Total number of HTTP requests made",
        &["method", "status"]
    ).unwrap();

    static ref REQUEST_DURATION: Histogram = register_histogram!(
        "request_duration_seconds",
        "Request duration in seconds"
    ).unwrap();

    static ref CACHE_HITS: IntCounter = register_int_counter!(
        "cache_hits_total",
        "Total number of cache hits"
    ).unwrap();

    static ref ACTIVE_REQUESTS: IntGauge = register_int_gauge!(
        "active_requests",
        "Number of requests currently being processed"
    ).unwrap();
}

const CACHE_MAX_CAPACITY: u64 = 1000;
const CACHE_TIME_TO_LIVE: Duration = Duration::from_secs(300); 
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize, Clone)]
struct ProxyRequest {
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<serde_json::Value>,
    #[serde(default)]
    use_cache: bool,
}

#[derive(Debug, Deserialize)]
struct WebSocketRequest {
    url: String,
    messages: Vec<String>,
    duration: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GraphQLRequest {
    url: String,
    query: String,
    variables: Option<serde_json::Value>,
    headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Clone)]
struct ProxyResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: serde_json::Value,
    cached: bool,
    timestamp: String,
    duration_ms: u64,
}

#[derive(Debug, Serialize)]
struct WebSocketMessage {
    direction: String,
    content: String,
    timestamp: String,
}

#[derive(Debug, Serialize)]
struct WebSocketResponse {
    messages: Vec<WebSocketMessage>,
    status: String,
    duration: u64,
}

#[derive(Debug, Serialize)]
struct GraphQLResponse {
    data: Option<serde_json::Value>,
    errors: Option<Vec<serde_json::Value>>,
    duration_ms: u64,
}

#[derive(Clone)]
struct AppState {
    cache: Cache<String, ProxyResponse>,
    client: reqwest::Client,
}

fn generate_cache_key(req: &ProxyRequest) -> String {
    format!("{}:{}:{}:{}",
        req.method,
        req.url,
        serde_json::to_string(&req.headers).unwrap_or_default(),
        serde_json::to_string(&req.body).unwrap_or_default()
    )
}

async fn proxy(req: web::Json<ProxyRequest>, state: web::Data<AppState>) -> HttpResponse {
    let start_time = std::time::Instant::now();
    ACTIVE_REQUESTS.inc();

    info!("Received {} request to {}", req.method, req.url);

    if req.use_cache && req.method == "GET" {
        let cache_key = generate_cache_key(&req);
        if let Some(cached_response) = state.cache.get(&cache_key).await {
            CACHE_HITS.inc();
            info!("Cache hit for {}", req.url);
            ACTIVE_REQUESTS.dec();
            return HttpResponse::Ok().json(cached_response);
        }
    }

    let mut headers = HeaderMap::new();
    if let Some(header_map) = &req.headers {
        for (key, value) in header_map {
            if let (Ok(header_name), Ok(header_value)) = (
                HeaderName::from_str(key),
                HeaderValue::from_str(value)
            ) {
                headers.insert(header_name, header_value);
            }
        }
    }

    let request_builder: reqwest::RequestBuilder = match req.method.to_uppercase().as_str() {
        "GET" => state.client.get(&req.url),
        "POST" => state.client.post(&req.url),
        "PUT" => state.client.put(&req.url),
        "DELETE" => state.client.delete(&req.url),
        "PATCH" => state.client.patch(&req.url),
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Unsupported HTTP method"
            }))
        }
    };

    let request_builder = request_builder.headers(headers);
    let request_builder = if let Some(body) = &req.body {
        request_builder.json(body)
    } else {
        request_builder
    };

    match tokio::time::timeout(REQUEST_TIMEOUT, request_builder.send()).await {
        Ok(result) => match result {
            Ok(response) => {
                let status = response.status().as_u16();
                HTTP_REQUESTS_TOTAL.with_label_values(&[&req.method, &status.to_string()]).inc(); 
                let headers: HashMap<String, String> = response
                    .headers()
                    .iter()
                    .map(|(name, value)| (
                        name.to_string(),
                        value.to_str().unwrap_or("").to_string()
                    ))
                    .collect();

                match response.json::<serde_json::Value>().await {
                    Ok(body) => {
                        let duration = start_time.elapsed();
                        REQUEST_DURATION.observe(duration.as_secs_f64());
                        let response_data = ProxyResponse {
                            status,
                            headers,
                            body,
                            cached: false,
                            timestamp: Utc::now().to_rfc3339(),
                            duration_ms: duration.as_millis() as u64,
                        };

                        if req.use_cache && req.method == "GET" && status >= 200 && status < 300 {
                            let cache_key = generate_cache_key(&req);
                            state.cache.insert(cache_key, response_data.clone()).await;
                        }
                        ACTIVE_REQUESTS.dec();
                        HttpResponse::Ok().json(response_data)
                    }
                    Err(e) => {
                        error!("Failed to parse response body: {}", e);
                        ACTIVE_REQUESTS.dec();
                        HttpResponse::Ok().json(ProxyResponse {
                            status,
                            headers,
                            body: serde_json::Value::Null,
                            cached: false,
                            timestamp: Utc::now().to_rfc3339(),
                            duration_ms: start_time.elapsed().as_millis() as u64,
                        })
                    }
                }
            }
            Err(e) => {
                error!("Request failed: {}", e);
                ACTIVE_REQUESTS.dec();
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Request failed: {}", e)
                }))
            }
        },
        Err(_) => {
            error!("Request timeout");
            ACTIVE_REQUESTS.dec();
            HttpResponse::GatewayTimeout().json(serde_json::json!({
                "error": "Request timeout"
            }))
        }
    }
}

async fn websocket(req: web::Json<WebSocketRequest>) -> HttpResponse {
    let start_time = std::time::Instant::now();
    
    let url = match Url::parse(&req.url) {
        Ok(url) => url,
        Err(e) => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Invalid WebSocket URL: {}", e)
            }));
        }
    };

    let (ws_stream, _) = match connect_async(url).await {
        Ok(conn) => conn,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("WebSocket connection failed: {}", e)
            }));
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let mut messages = Vec::new();

    for msg in &req.messages {
        match write.send(tokio_tungstenite::tungstenite::Message::Text(msg.clone())).await {
            Ok(_) => {
                messages.push(WebSocketMessage {
                    direction: "sent".to_string(),
                    content: msg.clone(),
                    timestamp: Utc::now().to_rfc3339(),
                });
            }
            Err(e) => {
                error!("Failed to send WebSocket message: {}", e);
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let timeout = Duration::from_secs(req.duration.unwrap_or(5));
    let _ = tokio::time::timeout(timeout, async {
        while let Some(message) = read.next().await {
            match message {
                Ok(msg) => {
                    if let Ok(text) = msg.to_text() {
                        messages.push(WebSocketMessage {
                            direction: "received".to_string(),
                            content: text.to_string(),
                            timestamp: Utc::now().to_rfc3339(),
                        });
                    }
                }
                Err(e) => {
                    error!("WebSocket receive error: {}", e);
                    break;
                }
            }
        }
    }).await;

    HttpResponse::Ok().json(serde_json::json!({
        "messages": messages,
        "duration_ms": start_time.elapsed().as_millis(),
        "status": "completed"
    }))
}

async fn graphql(req: web::Json<GraphQLRequest>) -> HttpResponse {
    let start_time = std::time::Instant::now();

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json"),
    );

    if let Some(custom_headers) = &req.headers {
        for (key, value) in custom_headers {
            if let (Ok(name), Ok(value)) = (HeaderName::from_str(key), HeaderValue::from_str(value)) {
                headers.insert(name, value);
            }
        }
    }

    let body = serde_json::json!({
        "query": req.query,
        "variables": req.variables
    });

    match client.post(&req.url)
        .headers(headers)
        .json(&body)
        .send()
        .await {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(gql_response) => HttpResponse::Ok().json(serde_json::json!({
                    "data": gql_response.get("data"),
                    "errors": gql_response.get("errors"),
                    "duration_ms": start_time.elapsed().as_millis()
                })),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to parse GraphQL response: {}", e)
                }))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("GraphQL request failed: {}", e)
        }))
    }
}

#[get("/metrics")]
async fn metrics() -> HttpResponse {
    use prometheus::Encoder;
    let encoder = prometheus::TextEncoder::new();
    let mut buffer = Vec::new();
    
    if let Err(e) = encoder.encode(&prometheus::gather(), &mut buffer) {
        error!("Failed to encode metrics: {}", e);
        return HttpResponse::InternalServerError().body("Failed to encode metrics");
    }
    
    HttpResponse::Ok()
        .content_type("text/plain")
        .body(String::from_utf8(buffer).unwrap())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));    
    info!("Starting server at http://localhost:8000");
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("Failed to create HTTP client");

    let cache: Cache<String, ProxyResponse> = Cache::builder()
        .max_capacity(CACHE_MAX_CAPACITY)
        .time_to_live(CACHE_TIME_TO_LIVE)
        .build();

    let state = web::Data::new(AppState { cache, client });
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600)
            )
            .service(metrics)
            .route("/proxy", web::post().to(proxy))
            .route("/ws", web::post().to(websocket))
            .route("/graphql", web::post().to(graphql))
    })
    .bind("127.0.0.1:8000")?
    .run()
    .await
}