import React, { useState, useEffect } from "react";

const API_URL = "https://sat-prep-platform-production.up.railway.app";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard({ user, onLogout, onStartTest }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem("sat_token");
    if (!token) return;
    fetch(`${API_URL}/api/exam/history`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(d => { if (d.exams) setHistory(d.exams); }).catch(() => {});
  }, []);

  const initials = user.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "??";
  const firstName = user.name?.split(" ")[0] || "there";
  const testsUsed = user.usage?.testsThisMonth || 0;
  const freeLimit = 3;
  const isPremium = user.isPremium;
  const limitReached = !isPremium && testsUsed >= freeLimit;
  const hasHistory = history.length > 0;
  const bestScore = hasHistory ? Math.max(...history.map(e => e.scores?.total || 0)) : null;
  const targetScore = 1500;
  const pointsRemaining = bestScore ? targetScore - bestScore : null;

  const S = {
    root: { background: "#0F1629", minHeight: "100vh", fontFamily: "Inter,sans-serif", color: "#e2e8f0" },
    nav: { background: "#111827", borderBottom: "0.5px solid rgba(255,255,255,0.07)", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" },
    bmark: { width: 28, height: 28, background: "#3B6FE8", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 },
    avatar: { width: 30, height: 30, borderRadius: "50%", background: "#1e3a6e", border: "1.5px solid #3B6FE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#93c5fd" },
    body: { padding: 24, display: "grid", gridTemplateColumns: "1fr 290px", gap: 18, maxWidth: 960, margin: "0 auto" },
    main: { display: "flex", flexDirection: "column", gap: 16 },
    side: { display: "flex", flexDirection: "column", gap: 16 },
    card: { background: "#161e35", border: "0.5px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 20px" },
    clabel: { fontSize: 10, fontWeight: 500, color: "#4a5568", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" },
    stat: { background: "#0f1629", borderRadius: 8, padding: "10px 12px", border: "0.5px solid rgba(255,255,255,0.05)" },
    prog_bg: { height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" },
    hist_row: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)" },
    rec: { background: "#0f1629", borderRadius: 8, padding: "11px 13px", marginBottom: 8, border: "0.5px solid rgba(255,255,255,0.05)" },
    startBtn: { padding: "10px 20px", background: "#3B6FE8", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  };

  return (
    <div style={S.root}>
      <div style={S.nav}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={S.bmark}>S</div>
          <span style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>SAT <span style={{ color: "#3B6FE8" }}>Pro</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, background: "rgba(59,111,232,0.15)", color: "#93c5fd", border: "0.5px solid rgba(59,111,232,0.25)" }}>
            {isPremium ? "Explorer" : "Free"}
          </span>
          <div style={S.avatar}>{initials}</div>
          <button onClick={onLogout} style={{ background: "transparent", border: "none", color: "#4a5568", cursor: "pointer", fontSize: 12 }}>Sign out</button>
        </div>
      </div>

      <div style={S.body}>
        <div style={S.main}>
          <div style={{ background: "#162040", border: "0.5px solid rgba(59,111,232,0.2)", borderRadius: 12, padding: "22px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: "#3B6FE8", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>{getGreeting()}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: "#fff", letterSpacing: "-.3px", marginBottom: 16 }}>{firstName}.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
              {[
                ["Target Score", targetScore, "#3B6FE8"],
                ["Current Score", bestScore || "—", bestScore ? "#a78bfa" : "#4a5568"],
                ["Today's Goal", hasHistory ? "Practice math" : "Take your first test", "#e2e8f0"],
                ["Est. Study Time", "2 hours", "#34d399"],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 9, padding: "10px 12px", border: "0.5px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 10, color: "#4a5568", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color, lineHeight: 1.2 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "#8892a4" }}>
                {limitReached ? "Free limit reached. Upgrade to keep going." : hasHistory ? `${freeLimit - testsUsed} tests remaining this month.` : "Start your first adaptive test to unlock your personalized roadmap."}
              </div>
              <button onClick={onStartTest} disabled={limitReached} style={{ ...S.startBtn, background: limitReached ? "#1e2a40" : "#3B6FE8", color: limitReached ? "#4a5568" : "#fff", cursor: limitReached ? "not-allowed" : "pointer" }}>
                {limitReached ? "Limit reached" : hasHistory ? "Start test →" : "Start diagnostic →"}
              </button>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.clabel}>Learning progress</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
              {[
                ["Target Score", targetScore, "#3B6FE8"],
                ["Current Score", bestScore || "—", bestScore ? "#a78bfa" : "#64748b"],
                ["Points to go", pointsRemaining !== null ? `+${pointsRemaining}` : "—", pointsRemaining !== null ? "#34d399" : "#64748b"],
              ].map(([label, val, color]) => (
                <div key={label} style={S.stat}>
                  <div style={{ fontSize: 20, fontWeight: 500, color, lineHeight: 1, marginBottom: 2 }}>{val}</div>
                  <div style={{ fontSize: 11, color: "#4a5568" }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ height: "0.5px", background: "rgba(255,255,255,0.05)", margin: "12px 0" }} />
            {[
              ["Algebra", hasHistory ? 90 : 0, "#34d399"],
              ["Reading & Writing", hasHistory ? 80 : 0, "#3B6FE8"],
              ["Geometry", hasHistory ? 59 : 0, "#fbbf24"],
              ["Advanced math", hasHistory ? 55 : 0, "#f87171"],
            ].map(([name, pct, color]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "#8892a4" }}>{name}</span>
                  <span style={{ color: "#fff", fontWeight: 500 }}>{hasHistory ? `${pct}%` : "—"}</span>
                </div>
                <div style={S.prog_bg}><div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} /></div>
              </div>
            ))}
            {!hasHistory && <div style={{ fontSize: 12, color: "#4a5568", textAlign: "center", marginTop: 4 }}>Complete your first test to track progress by subject</div>}
          </div>

          <div style={S.card}>
            <div style={S.clabel}>Recent tests</div>
            {!hasHistory ? (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🎯</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f0", marginBottom: 6 }}>Your journey starts here.</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, maxWidth: 300, margin: "0 auto 16px" }}>
                  Complete your first adaptive SAT to unlock score prediction, AI recommendations, and your Wrong Book.
                </div>
                <button onClick={onStartTest} style={{ ...S.startBtn, margin: "0 auto", display: "block" }}>
                  Start your first test →
                </button>
              </div>
            ) : (
              history.slice(0, 3).map((exam, i) => (
                <div key={i} style={{ ...S.hist_row, borderBottom: i === Math.min(history.length, 3) - 1 ? "none" : "0.5px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 18, fontWeight: 500, minWidth: 44, color: exam.scores?.total >= 1400 ? "#a78bfa" : exam.scores?.total >= 1200 ? "#3B6FE8" : "#64748b" }}>
                    {exam.scores?.total || "—"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 1 }}>
                      {new Date(exam.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div style={{ fontSize: 11, color: "#374151" }}>{exam.moduleSequence?.join(" · ") || "—"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={S.side}>
          <div style={{ background: "#161e35", border: "0.5px solid rgba(167,139,250,0.2)", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(167,139,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13, color: "#a78bfa" }}>✦</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#a78bfa" }}>AI recommendations</div>
            </div>
            {!hasHistory ? (
              <>
                <div style={{ ...S.rec, border: "0.5px solid rgba(167,139,250,0.15)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", marginBottom: 6 }}>Take your first adaptive test.</div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>We'll build your personalized study roadmap after your first exam.</div>
                </div>
                <button onClick={onStartTest} style={{ width: "100%", padding: 9, background: "rgba(167,139,250,0.1)", border: "0.5px solid rgba(167,139,250,0.3)", color: "#a78bfa", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", marginTop: 4 }}>
                  Start diagnostic test →
                </button>
              </>
            ) : (
              [
                ["Advanced math", "Quadratics and nonlinear functions — focus on vertex form.", "#f87171"],
                ["Geometry", "Circle theorems and arc-sector formulas appear on every module.", "#f87171"],
                ["English conventions", "Comma-splice fixes and modifier placement — 3 errors.", "#fbbf24"],
              ].map(([t, d, c]) => (
                <div key={t} style={S.rec}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#e2e8f0", marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />{t}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{d}</div>
                </div>
              ))
            )}
          </div>

          <div style={{ background: "#161e35", border: "0.5px solid rgba(59,111,232,0.15)", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: "#4a5568", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Monthly usage</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: "#8892a4" }}>Tests used</span>
              <span style={{ color: "#fff", fontWeight: 500 }}>{isPremium ? "Unlimited" : `${testsUsed} / ${freeLimit}`}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: isPremium ? "40%" : `${Math.min((testsUsed / freeLimit) * 100, 100)}%`, background: limitReached ? "#f87171" : "#3B6FE8", borderRadius: 2 }} />
            </div>
            {!isPremium && (
              <>
                <div style={{ fontSize: 11, color: limitReached ? "#f87171" : "#8892a4", marginBottom: 14 }}>
                  {limitReached ? "Free limit reached. Resets next month." : `${freeLimit - testsUsed} test${freeLimit - testsUsed !== 1 ? "s" : ""} remaining.`}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                  {["Unlimited adaptive tests", "AI study roadmap", "Wrong Book", "Score prediction"].map(b => (
                    <div key={b} style={{ fontSize: 12, color: "#8892a4", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#34d399", fontWeight: 600 }}>✓</span> {b}
                    </div>
                  ))}
                </div>
                <button style={{ width: "100%", padding: 9, background: "transparent", border: "0.5px solid #3B6FE8", color: "#3B6FE8", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                  ★ Upgrade to Explorer — $29.99/mo
                </button>
              </>
            )}
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 500, color: "#4a5568", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Wrong book</div>
            {!hasHistory ? (
              <div style={{ fontSize: 12, color: "#4a5568", lineHeight: 1.6 }}>Incorrect questions from your tests will appear here for focused review.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 10 }}>21 questions from your last test.</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {[["Advanced math · 5", "#f87171"], ["Geometry · 4", "#f87171"], ["Grammar · 3", "#fbbf24"], ["Data · 3", "#fbbf24"]].map(([tag, color]) => (
                    <span key={tag} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, background: `${color}18`, color, border: `0.5px solid ${color}33` }}>{tag}</span>
                  ))}
                </div>
                <button style={{ width: "100%", padding: 8, background: "rgba(59,111,232,0.08)", border: "0.5px solid rgba(59,111,232,0.2)", color: "#3B6FE8", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                  Review questions →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
