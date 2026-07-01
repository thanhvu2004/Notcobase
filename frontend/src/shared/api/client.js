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
    throw new Error('Unauthorized. Please sign in again.')
  }

  if (response.status === 403) {
    throw new Error('You do not have permission.')
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}
