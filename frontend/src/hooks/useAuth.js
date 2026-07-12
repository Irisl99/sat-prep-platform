import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sat_token');
    if (!token) { setLoading(false); return; }
    auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('sat_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await auth.login(email, password);
    localStorage.setItem('sat_token', token);
    setUser(user);
    return user;
  }

  async function register(name, email, password) {
    const { token, user } = await auth.register(name, email, password);
    localStorage.setItem('sat_token', token);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem('sat_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
