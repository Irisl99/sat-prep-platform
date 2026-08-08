import React, { useState, useEffect } from "react";

const API_URL = "https://sat-prep-platform-production.up.railway.app";

const MOCK_SAT_DATE = "Oct 3";
const MOCK_TARGET = 1450;
const MOCK_CURRENT = 1320;

const MOCK_SCORE_HISTORY = [
  { label: "Diagnostic", score: 1240 },
  { label: "Practice 1", score: 1280 },
  { label: "Practice 2", score: 1320 },
];

const MOCK_DOMAINS = {
  rw: [
    { name: "Information & Ideas", status: "needs_work" },
    { name: "Craft & Structure", status: "improving" },
    { name: "Expression of Ideas", status: "strong" },
    { name: "Standard English Conventions", status: "improving" },
  ],
  math: [
    { name: "Advanced Math", status: "needs_work" },
    { name: "Problem-Solving & Data", status: "needs_work" },
    { name: "Algebra", status: "improving" },
    { name: "Geometry & Trigonometry", status: "strong" },
  ],
};

const STATUS = {
  needs_work: { label: "Needs Work", dot: "#b87a3a", text: "#b87a3a" },
  improving:  { label: "Improving",  dot: "#4a7fba", text: "#4a7fba" },
  strong:     { label: "Strong",     dot: "#3a9a6e", text: "#3a9a6e" },
};

function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const W = 500, H = 88, PAD_X = 48;
  const scores = points.map(p => p.score);
  const lo = Math.min(...scores) - 50;
  const hi = Math.max(...scores) + 50;
  const Y_TOP = 18, Y_BOT = 60;
  const toX = i => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  const toY = s => Y_BOT - ((s - lo) / (hi - lo)) * (Y_BOT - Y_TOP);
  const pts = points.map((p, i) => ({ ...p, x: toX(i), y: toY(p.score) }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", overflow: "visible", display: "block" }}>
      <path d={d} fill="none" stroke="rgba(59,111,232,0.28)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const isLast = i === pts.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={isLast ? 5 : 3.5} fill={isLast ? "#3B6FE8" : "#1a2a45"} stroke={isLast ? "#3B6FE8" : "rgba(59,111,232,0.45)"} strokeWidth={isLast ? 2 : 1.5} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight={isLast ? "600" : "400"} fill={isLast ? "#e2e8f0" : "#8892a4"} fontFamily="Inter,-apple-system,sans-serif">{p.score}</text>
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize="10" fill="#546278" fontFamily="Inter,-apple-system,sans-serif">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.improving;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, flexShrink: 0, display: "inline-block" }} />
      <span style={{ fontSize: 12, color: s.text }}>{s.label}</span>
    </span>
  );
}

function DomainColumn({ sectionLabel, domains, C }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: "20px 22px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#546278", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>{sectionLabel}</div>
      {domains.map((d, i) => {
        const isWeak = d.status === "needs_work";
        return (
          <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: i === 0 ? 0 : 11, marginTop: i === 0 ? 0 : 11, borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 13, lineHeight: 1.3, color: isWeak ? "#d0d8e4" : "#a8b3c4", fontWeight: isWeak ? 500 : 400 }}>{d.name}</span>
            <StatusBadge status={d.status} />
          </div>
        );
      })}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard({ user, onLogout, onStartTest }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Dashboard");

  useEffect(() => {
    const token = localStorage.getItem("sat_token");
    if (!token) { setLoading(false); return; }
    fetch(`${API_URL}/api/exam/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.exams) setHistory(d.exams); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const firstName = user.name?.split(" ")[0] || "there";
  const initials = user.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "??";
  const hasDiagnostic = history.length > 0;
  const currentScore = hasDiagnostic ? Math.max(...history.map(e => e.scores?.total || 0)) : null;
  const scoreHistory = hasDiagnostic
    ? history.filter(e => e.scores?.total).sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).slice(-4).map((e, i) => ({ label: i === 0 ? "Diagnostic" : `Practice ${i}`, score: e.scores.total }))
    : MOCK_SCORE_HISTORY;
  const displayScore = currentScore ?? MOCK_CURRENT;
  const pointsToGoal = MOCK_TARGET - displayScore;

  const C = {
    bg: "#0B1120", navBg: "#0F1629", navBorder: "rgba(255,255,255,0.06)",
    blue: "#3B6FE8", text: "#e2e8f0", muted: "#8892a4", faint: "#4a5568",
    card: "#131d30", cardBorder: "rgba(255,255,255,0.07)", white: "#ffffff",
  };

  const NAV_ITEMS = ["Dashboard", "History", "Wrong Book"];

  const S = {
    root: { background: C.bg, minHeight: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", color: C.text },
    nav: { background: C.navBg, borderBottom: `1px solid ${C.navBorder}`, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 100 },
    body: { maxWidth: 660, margin: "0 auto", padding: "44px 24px 72px" },
    welcomeSection: { marginBottom: 28 },
    greeting: { fontSize: 30, fontWeight: 700, color: C.white, letterSpacing: "-0.5px", lineHeight: 1.2, marginBottom: 8 },
    subheading: { fontSize: 16, color: "#a0aab8", fontWeight: 400, marginBottom: 18, lineHeight: 1.5 },
    contextRow: { display: "inline-flex", alignItems: "center", gap: 0, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#6b7a90" },
    contextDot: { color: "#3d4d63", margin: "0 9px" },
    contextVal: { color: "#e8edf5", fontWeight: 600 },
    recCard: { background: "linear-gradient(145deg,#111d38 0%,#0e1830 60%,#121530 100%)", border: "1px solid rgba(59,111,232,0.2)", borderRadius: 18, padding: "30px 36px 28px", boxShadow: "0 0 80px rgba(59,111,232,0.1),0 20px 60px rgba(0,0,0,0.4)", position: "relative", overflow: "hidden" },
    recGlow: { position: "absolute", top: -80, right: -80, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle,rgba(59,111,232,0.12) 0%,transparent 70%)", pointerEvents: "none" },
    recEyebrow: { fontSize: 11, fontWeight: 600, color: C.blue, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 13, display: "flex", alignItems: "center", gap: 7 },
    recEyebrowDot: { width: 5, height: 5, borderRadius: "50%", background: C.blue, display: "inline-block" },
    recTitle: { fontSize: 26, fontWeight: 700, color: C.white, letterSpacing: "-0.4px", lineHeight: 1.25, marginBottom: 11 },
    recBody: { fontSize: 14, color: "#8a96aa", lineHeight: 1.7, marginBottom: 26, maxWidth: 420 },
    ctaButton: { display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 28px", background: "#3B6FE8", color: "#ffffff", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.1px", transition: "all 0.15s", boxShadow: "0 4px 18px rgba(59,111,232,0.45)", whiteSpace: "nowrap" },
    ctaMeta: { fontSize: 12, color: "#6b7a90", lineHeight: 1.5 },
    sectionDivider: { height: 1, background: "rgba(255,255,255,0.05)", margin: "44px 0 40px" },
    sectionTitle: { fontSize: 18, fontWeight: 600, color: C.white, letterSpacing: "-0.2px", marginBottom: 4 },
    sectionSub: { fontSize: 13, color: "#6b7a90", marginBottom: 20 },
    metricsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 },
    metricPrimary: { background: C.card, border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, padding: "18px 20px" },
    metricPrimaryValue: { fontSize: 32, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.8px", lineHeight: 1, marginBottom: 5 },
    metricSecondary: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "18px 20px" },
    metricSecondaryValue: { fontSize: 24, fontWeight: 600, color: "#c8d0dc", letterSpacing: "-0.4px", lineHeight: 1, marginBottom: 5 },
    metricTertiary: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "18px 20px" },
    metricTertiaryValue: { fontSize: 20, fontWeight: 500, color: "#5a8fd8", letterSpacing: "-0.2px", lineHeight: 1, marginBottom: 5 },
    metricLabel: { fontSize: 12, color: "#6b7a90" },
    sparkCard: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "18px 22px 14px", marginBottom: 36 },
    sparkLabel: { fontSize: 11, color: "#6b7a90", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 },
    focusGrid: { display: "flex", gap: 12, flexWrap: "wrap" },
    avatar: { width: 32, height: 32, borderRadius: "50%", background: "#1e3a6e", border: "1.5px solid #3B6FE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#93c5fd", marginLeft: 8, cursor: "pointer", flexShrink: 0 },
    navDivider: { width: 1, height: 18, background: C.navBorder, margin: "0 10px" },
  };

  return (
    <div style={S.root}>
      <nav style={S.nav}>
        <div style={{ fontSize:17, fontWeight:700, color:"#ffffff", letterSpacing:"-0.3px" }}>
          Expl<span style={{ color:"#3B6FE8" }}>orer</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          {NAV_ITEMS.map(name => (
            <button key={name} onClick={() => setActiveNav(name)} style={{ padding:"5px 12px", borderRadius:7, fontSize:13, fontWeight:activeNav===name?500:400, color:activeNav===name?"#ffffff":"#c8d0dc", background:activeNav===name?"rgba(255,255,255,0.09)":"transparent", border:"none", cursor:"pointer" }}>{name}</button>
          ))}
          <div style={S.navDivider} />
          <div style={S.avatar} onClick={onLogout}>{initials}</div>
        </div>
      </nav>
      <main style={S.body}>
        <section style={S.welcomeSection}>
          <h1 style={S.greeting}>{getGreeting()}, {firstName} 👋</h1>
          <p style={S.subheading}>Let's make today's study time count.</p>
          <div style={S.contextRow}>
            <span>SAT</span><span style={S.contextDot}>·</span>
            <span style={S.contextVal}>{MOCK_SAT_DATE}</span>
            <span style={S.contextDot}>·</span>
            <span>Target <span style={S.contextVal}>{MOCK_TARGET}</span></span>
            <span style={S.contextDot}>·</span>
            <span>Current <span style={S.contextVal}>{currentScore ?? MOCK_CURRENT}</span></span>
          </div>
        </section>
        <section>
          <div style={S.recCard}>
            <div style={S.recGlow} aria-hidden="true" />
            <div style={S.recEyebrow}><span style={S.recEyebrowDot} />Today's Recommendation</div>
            <h2 style={S.recTitle}>{hasDiagnostic ? "Continue your practice" : "Take your SAT Diagnostic"}</h2>
            <p style={S.recBody}>{hasDiagnostic ? "Your diagnostic is complete. Explorer has built your personalized study plan — keep the momentum going with today's recommended practice." : "Your diagnostic helps Explorer understand your current strengths and weaknesses so we can build your personalized study plan."}</p>
            <div>
              <button style={S.ctaButton} onClick={onStartTest}
                onMouseEnter={e => { e.currentTarget.style.background="#2d5ecf"; e.currentTarget.style.transform="translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background="#3B6FE8"; e.currentTarget.style.transform="translateY(0)"; }}>
                {hasDiagnostic ? "Start Practice →" : "Start Diagnostic →"}
              </button>
              <div style={{ ...S.ctaMeta, marginTop:11 }}>About 2 hours · Reading &amp; Writing + Math</div>
            </div>
          </div>
        </section>
        <div style={S.sectionDivider} aria-hidden="true" />
        <section style={{ marginBottom:36 }}>
          <div style={S.sectionTitle}>Your Progress</div>
          <div style={S.sectionSub}>See how you're tracking toward your SAT goal.</div>
          <div style={S.metricsRow}>
            <div style={S.metricPrimary}><div style={S.metricPrimaryValue}>{displayScore}</div><div style={S.metricLabel}>Current Score</div></div>
            <div style={S.metricSecondary}><div style={S.metricSecondaryValue}>{MOCK_TARGET}</div><div style={S.metricLabel}>Target Score</div></div>
            <div style={S.metricTertiary}><div style={S.metricTertiaryValue}>{pointsToGoal} pts</div><div style={S.metricLabel}>Points to target</div></div>
          </div>
          <div style={S.sparkCard}>
            <div style={S.sparkLabel}>Recent Test Scores</div>
            <Sparkline points={scoreHistory} />
          </div>
        </section>
        <section>
          <div style={S.sectionTitle}>Focus Areas</div>
          <div style={S.sectionSub}>These are the skills currently having the biggest impact on your score.</div>
          <div style={S.focusGrid}>
            <DomainColumn sectionLabel="Reading & Writing" domains={MOCK_DOMAINS.rw} C={C} />
            <DomainColumn sectionLabel="Math" domains={MOCK_DOMAINS.math} C={C} />
          </div>
        </section>
      </main>
    </div>
  );
}
