const API_ROOT = '/api'

export async function api(path, options = {}) {
  const token = localStorage.getItem('jwtToken')
  const isFormData = options.body instanceof FormData
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    const error = new Error('Unauthorized. Please sign in again.')
    error.status = response.status
    throw error
  }

  if (response.status === 403) {
    const error = new Error('You do not have permission.')
    error.status = response.status
    throw error
  }

  if (!response.ok) {
    const message = await response.text()
    const error = new Error(message || `Request failed with status ${response.status}`)
    error.status = response.status
    throw error
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}
