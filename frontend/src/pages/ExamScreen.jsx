import { useState, useEffect } from "react";

const MOCK_QUESTIONS = [
  { id:1, passage:`Marine biologist Dr. Aiko Tanaka has spent two decades studying how coral polyps respond to thermal stress. Her fieldwork in the Indo-Pacific suggests that certain reef systems can acclimate to elevated temperatures through a process of symbiont shuffling, in which polyps expel heat-sensitive algae and take up more resilient strains. Whether this adaptive capacity can proliferate across broader reef ecosystems before ocean temperatures exceed critical thresholds remains an open question.`, stem:`As used in the passage, "proliferate" most nearly means`, options:["struggle against external pressures","spread rapidly across a wider area","migrate to a more favorable location","calcify into a permanent structure"] },
  { id:2, passage:`Urban planners in several Nordic cities have begun designing what they call "sponge corridors" — networks of permeable surfaces, bioswales, and retention ponds threaded through dense residential zones. Unlike traditional stormwater infrastructure, which channels rainwater away as quickly as possible, sponge corridors are designed to absorb, filter, and slowly release water into the ground. Proponents argue that this approach reduces flood risk while simultaneously recharging local aquifers and supporting urban biodiversity.`, stem:`Which choice best states the main idea of the passage?`, options:["Nordic cities have eliminated flooding through aggressive infrastructure investment.","Traditional stormwater systems are costlier to maintain than sponge corridors.","Sponge corridors offer a flood-management approach that also provides ecological benefits.","Urban biodiversity declines whenever cities expand their impermeable surface area."] },
  { id:3, passage:`Historians long assumed that the Silk Road was primarily a commercial route, one that carried silk, spices, and precious metals between East and West. _______, recent archaeological evidence suggests it was equally important as a conduit for ideas: Buddhist iconography, mathematical notation, and musical instruments all made the journey alongside traded goods.`, stem:`Which choice most effectively completes the sentence with a logical transition?`, options:["Consequently,","Similarly,","However,","For example,"] },
  { id:4, passage:`The novelist Clarice Lispector is widely celebrated in Brazil, her dense, introspective prose has only recently attracted sustained attention from English-language readers.`, stem:`Which choice best addresses the punctuation issue in the underlined portion?`, options:["Brazil, her dense","Brazil; her dense","Brazil her dense","Brazil, and her dense"] },
  { id:5, passage:`A 2023 study by researchers at the University of Michigan tracked 400 undergraduate students across two semesters. Half used handwritten notes exclusively; the other half took notes on laptops. Students in the handwritten group scored, on average, 14 percent higher on concept-application questions, though no significant difference emerged on factual recall questions. The researchers hypothesized that the relative slowness of handwriting forces students to rephrase and synthesize information rather than transcribe it verbatim.`, stem:`Which finding from the study most directly supports the researchers' hypothesis?`, options:["Both groups performed similarly on questions requiring factual recall.","The handwritten group outperformed the laptop group on concept-application questions.","The study followed students across two full academic semesters.","The sample included 400 undergraduate participants from a single university."] },
];

const TOTAL_QUESTIONS = 27;
const LETTERS = ["A","B","C","D"];

function useTimer(initialSeconds) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return { display: `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`, seconds };
}

export default function ExamScreen({ user, onExit }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const timer = useTimer(32 * 60);

  const question = MOCK_QUESTIONS[Math.min(currentIdx, MOCK_QUESTIONS.length - 1)];
  const displayNum = currentIdx + 1;
  const selectedOpt = answers[currentIdx] ?? null;
  const isMarked = marked.has(currentIdx);

  const C = {
    bg:"#f7f6f3", surface:"#ffffff", border:"#e0e4eb", borderHover:"#bfc5d1",
    text:"#1a1f2e", muted:"#5a6478", faint:"#8892a4", blue:"#3B6FE8",
    blueTint:"rgba(59,111,232,0.07)", blueBorder:"rgba(59,111,232,0.55)",
    passageBg:"#f2f0ed", passageBorder:"rgba(0,0,0,0.09)",
    amber:"#a86c2a", amberTint:"rgba(168,108,42,0.08)", amberBorder:"rgba(168,108,42,0.25)",
    headerBorder:"rgba(0,0,0,0.08)", dimOverlay:"rgba(0,0,0,0.22)",
  };

  const isBackDisabled = currentIdx === 0;

  const S = {
    root:{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',-apple-system,sans-serif", color:C.text, display:"flex", flexDirection:"column" },
    header:{ background:C.surface, borderBottom:`1px solid ${C.headerBorder}`, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", position:"sticky", top:0, zIndex:100, flexShrink:0 },
    wordmark:{ fontSize:15, fontWeight:700, color:C.text, letterSpacing:"-0.2px" },
    sectionLabel:{ fontSize:13, color:C.muted, borderLeft:`1px solid ${C.border}`, paddingLeft:16 },
    timerDisplay:{ fontSize:16, fontWeight:600, letterSpacing:"0.02em", fontVariantNumeric:"tabular-nums", minWidth:50, textAlign:"right", color:timer.seconds < 300 ? "#c0392b" : C.text },
    toolsBtn:{ padding:"5px 12px", borderRadius:7, fontSize:13, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, cursor:"pointer", fontFamily:"inherit" },
    content:{ flex:1, overflowY:"auto", paddingBottom:72 },
    inner:{ maxWidth:700, margin:"0 auto", padding:"24px 28px 8px" },
    statusRow:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 },
    qNum:{ fontSize:13, color:C.faint },
    markBtn:{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:6, fontSize:12, fontWeight:500, color:isMarked?C.amber:C.faint, background:isMarked?C.amberTint:"transparent", border:`1px solid ${isMarked?C.amberBorder:C.border}`, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
    passage:{ background:C.passageBg, border:`1px solid ${C.passageBorder}`, borderRadius:8, padding:"16px 20px", marginBottom:20, fontSize:15, lineHeight:1.78, color:C.text },
    stem:{ fontSize:16, fontWeight:600, lineHeight:1.5, color:C.text, marginBottom:18, letterSpacing:"-0.1px" },
    choices:{ display:"flex", flexDirection:"column", gap:9 },
    choiceBase:(i) => ({ display:"flex", alignItems:"flex-start", gap:14, padding:"13px 15px", borderRadius:9, border:`1.5px solid ${selectedOpt===i?C.blueBorder:C.border}`, background:selectedOpt===i?C.blueTint:C.surface, cursor:"pointer", transition:"border-color 0.1s,background 0.1s" }),
    choiceLetter:(i) => ({ width:27, height:27, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, flexShrink:0, marginTop:2, border:`1.5px solid ${selectedOpt===i?C.blue:C.borderHover}`, color:selectedOpt===i?"#fff":C.muted, background:selectedOpt===i?C.blue:"transparent", transition:"all 0.1s" }),
    choiceText:{ fontSize:15, lineHeight:1.55, color:C.text, paddingTop:2 },
    bottomNav:{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.headerBorder}`, height:58, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", zIndex:100 },
    menuTrigger:{ display:"inline-flex", alignItems:"center", gap:5, padding:"7px 13px", borderRadius:7, fontSize:13, fontWeight:500, color:C.text, background:"transparent", border:`1px solid ${C.border}`, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
    backBtn:{ padding:"7px 16px", borderRadius:7, fontSize:13, fontWeight:500, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, fontFamily:"inherit", cursor:isBackDisabled?"not-allowed":"pointer", opacity:isBackDisabled?0.4:1 },
    nextBtn:{ padding:"7px 20px", borderRadius:7, fontSize:13, fontWeight:600, color:"#ffffff", background:C.blue, border:"none", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
    overlay:{ position:"fixed", inset:0, background:C.dimOverlay, zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" },
    menuPanel:{ background:C.surface, borderRadius:"14px 14px 0 0", padding:"20px 22px 74px", width:"100%", maxWidth:700, boxShadow:"0 -6px 32px rgba(0,0,0,0.12)" },
    menuHeader:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 },
    menuTitle:{ fontSize:14, fontWeight:600, color:C.text },
    closeBtn:{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:`1px solid ${C.border}`, cursor:"pointer", color:C.muted, fontSize:14, fontFamily:"inherit" },
    menuGrid:{ display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:6, marginBottom:18 },
    legendItem:{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:C.faint },
    legendDot:(bg,border) => ({ width:13, height:13, borderRadius:4, flexShrink:0, background:bg, border:`1.5px solid ${border}` }),
    toolsPopover:{ position:"absolute", top:56, right:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 18px", boxShadow:"0 4px 20px rgba(0,0,0,0.1)", zIndex:300, minWidth:210 },
  };

  const cellStyle = (idx) => {
    if (idx === currentIdx) return { bg:C.blue, border:C.blue, color:"#fff" };
    if (marked.has(idx))    return { bg:"#fef3e2", border:"#f5d5a0", color:C.amber };
    if (answers[idx]!=null) return { bg:"#e8f0fe", border:"#c5d5fb", color:C.blue };
    return { bg:C.surface, border:C.border, color:C.muted };
  };

  const goTo = (idx) => { setCurrentIdx(idx); setMenuOpen(false); };
  const goBack = () => { if (currentIdx > 0) setCurrentIdx(i => i - 1); };
  const goNext = () => { if (currentIdx < TOTAL_QUESTIONS - 1) setCurrentIdx(i => i + 1); };
  const toggleMark = () => setMarked(prev => { const n = new Set(prev); n.has(currentIdx) ? n.delete(currentIdx) : n.add(currentIdx); return n; });

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <div style={S.wordmark}>Expl<span style={{ color:"#3B6FE8" }}>orer</span></div>
          <div style={S.sectionLabel}>Reading &amp; Writing &nbsp;·&nbsp; Module 1</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, position:"relative" }}>
          <div style={S.timerDisplay}>{timer.display}</div>
          <div style={{ position:"relative" }}>
            <button style={S.toolsBtn} onClick={() => setToolsOpen(o => !o)}>Tools</button>
            {toolsOpen && (
              <div style={S.toolsPopover}>
                <div style={{ fontSize:11, fontWeight:600, color:C.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Tools</div>
                <div style={{ fontSize:13, color:C.muted, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>Calculator <span style={{ fontSize:11, color:C.faint }}>(Math only)</span></div>
                <div style={{ fontSize:13, color:C.muted, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>Reference Sheet <span style={{ fontSize:11, color:C.faint }}>(Math only)</span></div>
                <div style={{ fontSize:13, color:C.muted, padding:"6px 0" }}>Annotation <span style={{ fontSize:11, color:C.faint }}>(coming soon)</span></div>
              </div>
            )}
          </div>
        </div>
      </header>
      <main style={S.content} onClick={() => { if (toolsOpen) setToolsOpen(false); }}>
        <div style={S.inner}>
          <div style={S.statusRow}>
            <span style={S.qNum}>Question {displayNum} of {TOTAL_QUESTIONS}</span>
            <button style={S.markBtn} onClick={toggleMark}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={isMarked?C.amber:"none"} stroke={isMarked?C.amber:C.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              {isMarked ? "Marked for Review" : "Mark for Review"}
            </button>
          </div>
          <div style={S.passage}>{question.passage}</div>
          <div style={S.stem}>{question.stem}</div>
          <div style={S.choices}>
            {question.options.map((opt, i) => (
              <div key={i} style={S.choiceBase(i)}
                onClick={() => setAnswers(prev => ({ ...prev, [currentIdx]: i }))}
                onMouseEnter={e => { if (selectedOpt !== i) { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = "#f4f5f8"; } }}
                onMouseLeave={e => { if (selectedOpt !== i) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; } }}>
                <div style={S.choiceLetter(i)}>{LETTERS[i]}</div>
                <div style={S.choiceText}>{opt}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <nav style={S.bottomNav}>
        <button style={S.menuTrigger} onClick={() => setMenuOpen(true)}>
          Question {displayNum}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button style={S.backBtn} onClick={goBack} disabled={isBackDisabled}>Back</button>
          <button style={S.nextBtn} onClick={goNext}>{currentIdx === TOTAL_QUESTIONS - 1 ? "Review" : "Next →"}</button>
        </div>
      </nav>
      {menuOpen && (
        <div style={S.overlay} onClick={() => setMenuOpen(false)}>
          <div style={S.menuPanel} onClick={e => e.stopPropagation()}>
            <div style={S.menuHeader}>
              <span style={S.menuTitle}>Reading &amp; Writing &nbsp;·&nbsp; Module 1</span>
              <button style={S.closeBtn} onClick={() => setMenuOpen(false)}>&#x2715;</button>
            </div>
            <div style={S.menuGrid}>
              {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
                const st = cellStyle(i);
                return <button key={i} onClick={() => goTo(i)} style={{ aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:7, border:`1.5px solid ${st.border}`, background:st.bg, color:st.color, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{i+1}</button>;
              })}
            </div>
            <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
              <div style={S.legendItem}><div style={S.legendDot("#e8f0fe","#c5d5fb")} />Answered</div>
              <div style={S.legendItem}><div style={S.legendDot(C.surface,C.border)} />Unanswered</div>
              <div style={S.legendItem}><div style={S.legendDot("#fef3e2","#f5d5a0")} />Marked for Review</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
