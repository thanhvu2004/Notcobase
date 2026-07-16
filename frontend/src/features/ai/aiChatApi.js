import { api } from '../../shared/api/client'

export function getAiSettings() {
  return api('/ai/settings')
}

export function updateAiSettings(settings) {
  return api('/ai/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function sendAiChatMessage(message, history = [], language = 'en') {
  return api('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, language }),
  })
}
