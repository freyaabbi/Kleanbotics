// Shared auth helpers. The JWT is issued by POST /api/auth/login and stored in
// localStorage; admin-only write calls attach it as a Bearer header.
export const API = process.env.REACT_APP_API_BASE || 'http://localhost:5050';

export const getToken = () => localStorage.getItem('authToken') || '';

// Spread into a fetch() headers object on protected (admin) requests.
export const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
