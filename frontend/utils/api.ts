import { APIRequest } from '../types'

export const API_BASE_URL = 'http://localhost:8000'

export const getEndpoint = (requestType: APIRequest['type']): string => {
  const endpoints = {
    'HTTP': '/proxy',
    'WebSocket': '/ws',
    'GraphQL': '/graphql'
  }
  return `${API_BASE_URL}${endpoints[requestType]}`
}

export const formatJSON = (data: unknown): string => {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}