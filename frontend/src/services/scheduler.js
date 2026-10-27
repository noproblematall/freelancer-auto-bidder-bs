import api from './api'

export const getSchedulerStatus = () => api.get('/scheduler/status').then(r => r.data)
