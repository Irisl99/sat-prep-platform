import React, { useState, useEffect } from "react";
import AuthPage   from "./pages/AuthPage";
import Dashboard  from "./pages/Dashboard";
import ExamScreen from "./pages/ExamScreen";

const API_URL = import.meta.env.VITE_API_URL ?? "https://sat-prep-platform-production.up.railway.app";

export default function App() {
  const [user,     setUser]     = useState(null);
  const [checking, setChecking] = useState(true);
  const [screen,   setScreen]   = useState("dashboard");

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
    setScreen("dashboard");
  }

  function startTest() {
    setScreen("exam");
  }

  if (checking) return (
    <div style={{ minHeight:"100vh", background:"#0F1629", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#3B6FE8", fontSize:14, fontFamily:"Inter,sans-serif" }}>Loading…</div>
    </div>
  );

  if (!user) return <AuthPage onLogin={setUser} />;

  if (screen === "exam") return <ExamScreen user={user} onExit={() => setScreen("dashboard")} />;

  return <Dashboard user={user} onLogout={logout} onStartTest={startTest} />;
}
