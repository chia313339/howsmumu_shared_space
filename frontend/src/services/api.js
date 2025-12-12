import axios from 'axios'

const client = axios.create({
  baseURL: '/',
  withCredentials: true
})

export function loginRequest (password) {
  return client.post('/auth/login', { password })
}

export function logoutRequest () {
  return client.post('/auth/logout')
}

export async function fetchFiles () {
  const { data } = await client.get('/api/files')
  return data
}

export async function uploadFile (file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await client.post('/api/files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

export async function deleteFile (path) {
  const { data } = await client.delete(`/api/files/${encodeURIComponent(path)}`)
  return data
}
