import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Session expiration time (24 hours in milliseconds)
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for saved user in localStorage with expiration validation
    try {
      const savedSession = localStorage.getItem('unipost_session');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        const now = Date.now();
        
        // Validate session hasn't expired
        if (session.expiresAt && session.expiresAt > now && session.user) {
          setUser(session.user);
        } else {
          // Clear expired session
          localStorage.removeItem('unipost_session');
        }
      }
    } catch (error) {
      // Clear invalid session data
      localStorage.removeItem('unipost_session');
    }
    setLoading(false);
  }, []);

  const saveSession = (userData) => {
    const session = {
      user: userData,
      expiresAt: Date.now() + SESSION_EXPIRY
    };
    localStorage.setItem('unipost_session', JSON.stringify(session));
  };

  const login = async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setUser(data.user);
    saveSession(data.user);
    return data.user;
  };

  const register = async (username, password, email) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    setUser(data.user);
    saveSession(data.user);
    return data.user;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('unipost_session');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
