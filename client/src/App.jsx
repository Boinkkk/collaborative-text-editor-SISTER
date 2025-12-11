import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Editor from './Page/Editor';
import LoginPage from './Page/LoginPage';
import Dashboard from './Page/Dashboard';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        {/* Route Login */}
        <Route path="/login" element={
          !user ? <LoginPage onLogin={setUser} /> : <Navigate to="/" />
        } />

        {/* Route Dashboard (Halaman Utama) */}
        <Route path="/" element={
          user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />
        } />

        {/* Route Editor (Dinamis) */}
        <Route path="/doc/:id" element={
          user ? <Editor user={user} /> : <Navigate to="/login" />
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;