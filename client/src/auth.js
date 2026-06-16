import React, { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('mp_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mp_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem('mp_user', JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem('mp_token');
        localStorage.removeItem('mp_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('mp_token', res.data.token);
    localStorage.setItem('mp_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    localStorage.removeItem('mp_token');
    localStorage.removeItem('mp_user');
    setUser(null);
  }

  const isCoordinator = user && user.role === 'coordinator';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isCoordinator }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
