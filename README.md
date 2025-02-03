# 🚀 API Tester
> ⚠️ Note: Backend requires self-hosting (not provided due to hosting costs)
> 🔍 Easy-to-use API testing tool with HTTP, WebSocket, and GraphQL support

## ⚡ Features

- 🌐 HTTP requests (GET, POST, PUT, DELETE)
- 🔌 WebSocket testing
- 📊 GraphQL support
- 🌓 Dark/Light mode
- 💾 Save requests
- 📜 Request history

## 🏃‍♂️ Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Visit `http://localhost:3000`

### Backend

To run locally:
```bash
cd api-tester
cargo run
```

## 📝 Usage

1. 🔗 Enter API URL
2. 📋 Choose request type
3. ⌨️ Add headers/body in JSON format:
```json
{
  "key": "value"
}
```
4. 🚀 Hit Send!

## 🛠️ Built With

- 🌐 Next.js + TypeScript
- 🎨 Tailwind CSS
- 🦀 Rust (Backend)

## 🧪 Test APIs

- `https://jsonplaceholder.typicode.com/posts`
- `https://ws.postman-echo.com/raw` (WebSocket)
- `https://graphqlzero.almansi.me/api` (GraphQL)
