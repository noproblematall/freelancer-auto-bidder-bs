import api from './api'

// Conversations where a client wrote to you (live from Freelancer).
export async function getConversations(refresh = false) {
  const { data } = await api.get('/conversations', { params: refresh ? { refresh: 1 } : {}, timeout: 60000 })
  return data
}

// One conversation: messages, client, project and your bid.
export async function getConversation(threadId, refresh = false) {
  const { data } = await api.get(`/conversations/${threadId}`, { params: refresh ? { refresh: 1 } : {}, timeout: 60000 })
  return data
}
