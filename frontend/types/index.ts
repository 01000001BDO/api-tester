export type RequestType = 'HTTP' | 'WebSocket' | 'GraphQL'
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface APIRequest {
  type: RequestType
  url: string
  method?: HTTPMethod
  headers?: Record<string, string>
  body?: Record<string, any>
  name?: string
  wsMessages?: string[]
  graphqlQuery?: string
}

export interface APIResponse {
  status: number
  headers?: Record<string, string>
  body: any
  duration_ms: number
}

export interface SavedRequest extends APIRequest {
  id: string
  createdAt: string
}

export interface HistoryItem {
  request: APIRequest
  response: APIResponse
  timestamp: string
}