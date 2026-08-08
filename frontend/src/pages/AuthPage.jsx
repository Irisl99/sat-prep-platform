import React, { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "https://sat-prep-platform-production.up.railway.app";

async function apiCall(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function AnimatedScore() {
  const [score, setScore] = useState(1080);
  const [started, setStarted] = useState(false);
  function startAnim() {
    if (started) return;
    setStarted(true);
    let cur = 1080;
    const step = () => {
      cur += Math.ceil((1580 - cur) / 16);
      if (cur >= 1580) { setScore(1580); return; }
      setScore(cur);
      setTimeout(step, 38);
    };
    setTimeout(step, 400);
  }
  const pct = ((score - 400) / 1200) * 100;
  return (
    <div onClick={startAnim} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"18px 22px",cursor:"pointer",position:"relative",zIndex:1}}>
      <div style={{fontSize:10,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:"#3d4a5c",marginBottom:6}}>Practice score</div>
      <div style={{fontSize:46,color:"#fff",fontWeight:700,lineHeight:1,letterSpacing:-2}}>{score.toLocaleString()}</div>
      <div style={{fontSize:14,color:"#3d4a5c",marginTop:2,marginBottom:12}}>/ 1600</div>
      <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden",marginBottom:8}}>
        <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#3B6FE8,#818cf8)",borderRadius:2,transition:"width .04s"}}/>
      </div>
      <div style={{fontSize:11,color:"#3d4a5c"}}>{started ? "Keep practicing →" : "Click to see your potential"}</div>
    </div>
  );
}

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free");

  function update(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login"
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };
      const data = await apiCall(path, body);
      localStorage.setItem("sat_token", data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const S = {
    root: { display:"grid", gridTemplateColumns:"1fr 1fr", minHeight:"100vh", fontFamily:"Inter,sans-serif" },
    left: { background:"#0F1629", padding:36, display:"flex", flexDirection:"column", justifyContent:"space-between", position:"relative", overflow:"hidden" },
    right: { background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", padding:"36px 32px" },
    tab: (active) => ({ flex:1, padding:"7px", borderRadius:6, border:"none", background: active?"#fff":"transparent", color: active?"#0F1629":"#64748b", fontWeight:500, fontSize:13, cursor:"pointer", transition:"all .15s", boxShadow: active?"0 1px 2px rgba(0,0,0,.06)":"none" }),
    input: { width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:14, color:"#0F1629", outline:"none", fontFamily:"Inter,sans-serif" },
    btn: { width:"100%", padding:11, background:"#3B6FE8", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:4 },
  };

  return (
    <div style={S.root}>
      <div style={S.left}>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative",zIndex:1}}>
          <div style={{width:32,height:32,background:"#3B6FE8",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:16}}>S</div>
          <span style={{fontSize:17,color:"#fff",fontWeight:600}}>SAT <span style={{color:"#3B6FE8"}}>Pro</span></span>
        </div>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#3B6FE8",marginBottom:12}}>AI-Powered Adaptive Testing</div>
          <div style={{fontSize:28,color:"#fff",fontWeight:700,lineHeight:1.2,marginBottom:10,letterSpacing:"-.5px"}}>Score higher.<br/>Practice smarter.</div>
          <div style={{fontSize:13,color:"#8892a4",lineHeight:1.65}}>The only SAT platform that adapts to your skill level in real time — just like the real Digital SAT.</div>
        </div>
        <AnimatedScore />
        <div style={{display:"flex",flexDirection:"column",gap:8,position:"relative",zIndex:1}}>
          {["Real MST adaptive engine — same as College Board","AI-generated questions, unlimited practice","Weakness analysis by domain after every test","SAT-style score estimate: 200–1600"].map(f=>(
            <div key={f} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#8892a4"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:"#3B6FE8",flexShrink:0}}/>
              {f}
            </div>
          ))}
        </div>
      </div>
      <div style={S.right}>
        <div style={{width:"100%",maxWidth:320}}>
          <div style={{display:"flex",gap:0,marginBottom:22,background:"#f1f5f9",borderRadius:8,padding:3}}>
            <button style={S.tab(mode==="login")} onClick={()=>{setMode("login");setError("");}}>Sign in</button>
            <button style={S.tab(mode==="register")} onClick={()=>{setMode("register");setError("");}}>Create account</button>
          </div>
          {mode==="login" ? (
            <><div style={{fontSize:20,fontWeight:700,color:"#0F1629",marginBottom:4,letterSpacing:"-.3px"}}>Welcome back</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:20}}>New here? <a href="#" style={{color:"#3B6FE8",textDecoration:"none"}} onClick={e=>{e.preventDefault();setMode("register");setError("");}}>Create a free account</a></div></>
          ) : (
            <><div style={{fontSize:20,fontWeight:700,color:"#0F1629",marginBottom:4,letterSpacing:"-.3px"}}>Start for free</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>Already have an account? <a href="#" style={{color:"#3B6FE8",textDecoration:"none"}} onClick={e=>{e.preventDefault();setMode("login");setError("");}}>Sign in</a></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <div onClick={()=>setSelectedPlan("free")} style={{border:selectedPlan==="free"?"1.5px solid #3B6FE8":"1.5px solid #e2e8f0",borderRadius:8,padding:10,textAlign:"center",cursor:"pointer",background:selectedPlan==="free"?"#eff6ff":"#fff",transition:"all .15s"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#0F1629"}}>Free</div>
                <div style={{fontSize:17,fontWeight:700,color:"#3B6FE8",margin:"2px 0"}}>$0</div>
                <div style={{fontSize:10,color:"#64748b"}}>3 tests / month</div>
              </div>
              <div onClick={()=>setSelectedPlan("explorer")} style={{border:selectedPlan==="explorer"?"1.5px solid #3B6FE8":"1.5px solid #e2e8f0",borderRadius:8,padding:10,textAlign:"center",cursor:"pointer",background:selectedPlan==="explorer"?"#eff6ff":"#fff",transition:"all .15s"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#0F1629"}}>Explorer</div>
                <div style={{fontSize:17,fontWeight:700,color:"#3B6FE8",margin:"2px 0"}}>$29.99</div>
                <div style={{fontSize:10,color:"#64748b"}}>Unlimited + analysis</div>
              </div>
            </div></>
          )}
          {error && <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#dc2626",marginBottom:12}}>{error}</div>}
          <form onSubmit={submit}>
            {mode==="register" && (
              <div style={{marginBottom:14}}>
                <label style={{display:"block",fontSize:12,fontWeight:500,color:"#374151",marginBottom:5}}>Full name</label>
                <input style={S.input} type="text" placeholder="Jane Smith" value={form.name} onChange={update("name")} required autoFocus/>
              </div>
            )}
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:12,fontWeight:500,color:"#374151",marginBottom:5}}>Email address</label>
              <input style={S.input} type="email" placeholder="jane@example.com" value={form.email} onChange={update("email")} required/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:12,fontWeight:500,color:"#374151",marginBottom:5}}>Password</label>
              <input style={S.input} type="password" placeholder={mode==="register"?"At least 8 characters":"Your password"} value={form.password} onChange={update("password")} required minLength={8}/>
            </div>
            <button style={S.btn} type="submit" disabled={loading}>
              {loading ? "Please wait…" : mode==="login" ? "Sign in →" : "Create free account →"}
            </button>
          </form>
          <p style={{fontSize:11,color:"#9ca3af",textAlign:"center",marginTop:14}}>By continuing you agree to our Terms of Service and Privacy Policy.</p>
        </div>
      </div>
    </div>
  );
}
