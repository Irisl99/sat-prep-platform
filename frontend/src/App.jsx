import { useState, useEffect } from "react";
import AuthPage from "./pages/AuthPage";

const API_URL = "http://localhost:3001";

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

  if (checking) return (
    <div style={{minHeight:"100vh",background:"#0F1629",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#3B6FE8",fontSize:14,fontFamily:"Inter,sans-serif"}}>Loading…</div>
    </div>
  );

  if (!user) return <AuthPage onLogin={setUser} />;

  return (
    <div style={{minHeight:"100vh",background:"#0F1629",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Inter,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>👋</div>
        <div style={{fontSize:20,fontWeight:600}}>Welcome, {user.name}!</div>
        <div style={{color:"#8892a4",marginTop:8,fontSize:14}}>Dashboard coming next…</div>
        <button onClick={() => { localStorage.removeItem("sat_token"); setUser(null); }}
          style={{marginTop:24,padding:"8px 20px",background:"transparent",border:"1px solid #3B6FE8",color:"#3B6FE8",borderRadius:8,cursor:"pointer",fontSize:14}}>
          Sign out
        </button>
      </div>
    </div>
  );
}
