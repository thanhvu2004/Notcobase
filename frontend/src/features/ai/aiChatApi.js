const DEFAULT_AI_CHAT_URL = 'http://127.0.0.1:8765/chat'

export async function sendAiChatMessage(message, history = [], language = 'en') {
  const response = await fetch(import.meta.env.VITE_AI_CHAT_URL || DEFAULT_AI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, history, language }),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error || `AI chat request failed with status ${response.status}`)
  }

  return payload
}
