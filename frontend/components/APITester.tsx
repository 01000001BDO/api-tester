'use client'

import { useState, useEffect } from 'react'
import { RequestType, HTTPMethod, APIRequest, APIResponse, SavedRequest, HistoryItem } from '@/types'
import { formatError, validateJSON } from '@/utils/error'
import { getEndpoint, formatJSON } from '@/utils/api'

export default function APITester() {
  const [requestType, setRequestType] = useState<RequestType>('HTTP')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<HTTPMethod>('GET')
  const [headers, setHeaders] = useState('')
  const [body, setBody] = useState('')
  const [wsMessages, setWsMessages] = useState('')
  const [graphqlQuery, setGraphqlQuery] = useState('')
  const [requestName, setRequestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [activeTab, setActiveTab] = useState('request')
  const [response, setResponse] = useState<APIResponse | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([])

  useEffect(() => {
    const darkMode = localStorage.getItem('darkMode') === 'true'
    setIsDark(darkMode)
    document.documentElement.classList.toggle('dark', darkMode)
    const savedHistory = localStorage.getItem('apiHistory')
    const savedReqs = localStorage.getItem('savedRequests')
    if (savedHistory) setHistory(JSON.parse(savedHistory))
    if (savedReqs) setSavedRequests(JSON.parse(savedReqs))
  }, [])

  const toggleTheme = () => {
    const newTheme = !isDark
    setIsDark(newTheme)
    localStorage.setItem('darkMode', String(newTheme))
    document.documentElement.classList.toggle('dark', newTheme)
  }

  const buildRequest = (): APIRequest => {
    const baseRequest: APIRequest = {
      type: requestType,
      url,
      name: requestName || url
    }

    switch (requestType) {
      case 'HTTP':
        if (headers && !validateJSON(headers)) throw new Error('Invalid headers JSON format')
        if (body && !validateJSON(body)) throw new Error('Invalid body JSON format')
        return {
          ...baseRequest,
          method,
          headers: headers ? JSON.parse(headers) : {},
          body: body ? JSON.parse(body) : null,
        }
      case 'WebSocket':
        return {
          ...baseRequest,
          wsMessages: wsMessages.split('\n').filter(msg => msg.trim())
        }
      case 'GraphQL':
        if (headers && !validateJSON(headers)) throw new Error('Invalid headers JSON format')
        if (body && !validateJSON(body)) throw new Error('Invalid variables JSON format')
        return {
          ...baseRequest,
          graphqlQuery,
          headers: headers ? JSON.parse(headers) : {},
          body: body ? JSON.parse(body) : null
        }
      default:
        return baseRequest
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const request = buildRequest()
      const endpoint = getEndpoint(request.type)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      const data = await response.json()
      setResponse(data)

      const historyItem: HistoryItem = {
        request,
        response: data,
        timestamp: new Date().toISOString()
      }

      const newHistory = [...history, historyItem].slice(-10)
      setHistory(newHistory)
      localStorage.setItem('apiHistory', JSON.stringify(newHistory))
    } catch (err) {
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }

  const loadRequest = (request: APIRequest) => {
    setRequestType(request.type)
    setUrl(request.url)
    setRequestName(request.name || '')
    
    switch (request.type) {
      case 'HTTP':
        setMethod(request.method || 'GET')
        setHeaders(request.headers ? formatJSON(request.headers) : '')
        setBody(request.body ? formatJSON(request.body) : '')
        break
      case 'WebSocket':
        setWsMessages(request.wsMessages?.join('\n') || '')
        break
      case 'GraphQL':
        setGraphqlQuery(request.graphqlQuery || '')
        setHeaders(request.headers ? formatJSON(request.headers) : '')
        setBody(request.body ? formatJSON(request.body) : '')
        break
    }
    
    setActiveTab('request')
  }

  const saveRequest = () => {
    try {
      const request = buildRequest()
      const newRequest: SavedRequest = {
        ...request,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      }

      const newSavedRequests = [...savedRequests, newRequest]
      setSavedRequests(newSavedRequests)
      localStorage.setItem('savedRequests', JSON.stringify(newSavedRequests))
    } catch (err) {
      setError(formatError(err))
    }
  }

  const deleteRequest = (id: string) => {
    const newSavedRequests = savedRequests.filter(r => r.id !== id)
    setSavedRequests(newSavedRequests)
    localStorage.setItem('savedRequests', JSON.stringify(newSavedRequests))
  }

  const renderTabButton = (tab: string) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 font-medium border-b-2 transition-colors ${
        activeTab === tab
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {tab.charAt(0).toUpperCase() + tab.slice(1)}
    </button>
  )

  const renderTypeButton = (type: RequestType) => (
    <button
      key={type}
      onClick={() => setRequestType(type)}
      className={`px-4 py-2 rounded-lg transition-colors ${
        requestType === type
          ? 'bg-blue-500 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {type}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>

        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-4" aria-label="Tabs">
            {['request', 'history', 'saved'].map(renderTabButton)}
          </nav>
        </div>

        {activeTab === 'request' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              {(['HTTP', 'WebSocket', 'GraphQL'] as const).map(renderTypeButton)}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                  Request Name (optional)
                </label>
                <input
                  type="text"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Request"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-grow">
                  <label className="block text-sm font-medium mb-2 dark:text-gray-300">URL</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={`Enter ${requestType} URL`}
                    required
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {requestType === 'HTTP' && (
                  <div>
                    <label className="block text-sm font-medium mb-2 dark:text-gray-300">Method</label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as HTTPMethod)}
                      className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {requestType !== 'WebSocket' && (
                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                    Headers (JSON)
                  </label>
                  <textarea
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder='{"Authorization": "Bearer token"}'
                  />
                </div>
              )}

              {requestType === 'WebSocket' ? (
                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                    Messages (one per line)
                  </label>
                  <textarea
                    value={wsMessages}
                    onChange={(e) => setWsMessages(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    placeholder="Enter messages to send"
                  />
                </div>
              ) : requestType === 'GraphQL' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                      GraphQL Query
                    </label>
                    <textarea
                      value={graphqlQuery}
                      onChange={(e) => setGraphqlQuery(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={4}
                      placeholder="query { ... }"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                      Variables (JSON)
                    </label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={4}
                      placeholder='{"variable": "value"}'
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-gray-300">
                    Body (JSON)
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    rows={4}
                    placeholder='{"key": "value"}'
                    disabled={method === 'GET'}
                  />
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/50 text-red-600 dark:text-red-200 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={saveRequest}
                  className="px-4 py-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Save Request
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </form>

            {response && (
              <div className="mt-8 space-y-4">
                <div className={`px-3 py-2 rounded-lg ${
                  response.status >= 200 && response.status < 300
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200'
                }`}>
                  Status: {response.status}
                </div>
                <div className="px-3 py-2 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-lg">
                  Duration: {response.duration_ms}ms
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-auto">
                  <pre className="text-sm dark:text-white">{formatJSON(response)}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {history.map((item, index) => (
              <div key={index} className="p-4 border rounded-lg dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium">{item.request.type}</span>
                    <span className="mx-2">→</span>
                    <span className="text-gray-600 dark:text-gray-400">{item.request.url}</span>
                  </div>
                  <button
                    onClick={() => loadRequest(item.request)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600 transition-colors"
                  >
                    Load
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-4">
            {savedRequests.map((request) => (
              <div key={request.id} className="p-4 border rounded-lg dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium">{request.name || request.url}</span>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {request.type} → {request.url}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadRequest(request)}
                      className="px-3 py-1 text-sm border rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600 transition-colors"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteRequest(request.id)}
                      className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/50 dark:border-red-900 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}