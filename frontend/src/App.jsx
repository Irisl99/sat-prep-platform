import React, { useState, useEffect } from "react";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";

const API_URL = "https://sat-prep-platform-production.up.railway.app";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("sat_token");
    if (!token) { setChecking(false); return; }
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.user) setUser(d.user); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  function logout() {
    localStorage.removeItem("sat_token");
    setUser(null);
  }

  function startTest() {
    alert("Exam screen coming in Sprint 3!");
  }

  if (checking) return (
    <div style={{minHeight:"100vh",background:"#0F1629",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#3B6FE8",fontSize:14,fontFamily:"Inter,sans-serif"}}>Loading…</div>
    </div>
  );

  if (!user) return <AuthPage onLogin={setUser} />;

  return <Dashboard user={user} onLogout={logout} onStartTest={startTest} />;
}
