// app/lib/api.js
const API_URL = 'http://localhost:8000/api';

// login: email, username, atau NISN
export async function login(login, password) {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ login, password }),
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    const detail = data.errors && Object.values(data.errors)[0]?.[0];
    throw new Error(detail || data.message || 'Login gagal');
  }
  
  return data;
}

export async function getUser(token) {
  const res = await fetch(`${API_URL}/user`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  
  if (!res.ok) {
    throw new Error('Unauthorized');
  }
  
  return res.json();
}