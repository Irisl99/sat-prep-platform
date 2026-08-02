import 'dotenv/config';
import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import Question from '../src/models/Question.js';

const PILOT_SLOTS = [
  { section:'rw', domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'hard',   type:'mcq' },
  { section:'rw', domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'hard',   type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'hard',   type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'hard',   type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'hard',   type:'mcq' },
  { section:'rw', domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'hard',   type:'mcq' },
  { section:'rw', domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'easy',   type:'mcq' },
  { section:'rw', domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'medium', type:'mcq' },
  { section:'rw', domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'hard',   type:'mcq' },
  { section:'math', domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'easy',   type:'mcq'  },
  { section:'math', domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'easy',   type:'grid' },
  { section:'math', domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'medium', type:'mcq'  },
  { section:'math', domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'easy',   type:'mcq'  },
  { section:'math', domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'medium', type:'mcq'  },
  { section:'math', domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'hard',   type:'grid' },
  { section:'math', domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'easy',   type:'mcq'  },
  { section:'math', domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'medium', type:'grid' },
  { section:'math', domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'medium', type:'mcq'  },
  { section:'math', domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'hard',   type:'mcq'  },
  { section:'math', domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'hard',   type:'grid' },
  { section:'math', domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'medium', type:'mcq'  },
  { section:'math', domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'hard',   type:'mcq'  },
  { section:'math', domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'hard',   type:'grid' },
  { section:'math', domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'easy',   type:'mcq'  },
  { section:'math', domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'medium', type:'mcq'  },
  { section:'math', domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'medium', type:'mcq'  },
  { section:'math', domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'hard',   type:'mcq'  },
  { section:'math', domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'easy',   type:'mcq'  },
  { section:'math', domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'medium', type:'grid' },
  { section:'math', domain:'Geometry Trig',        skill:'Circles and Angles',         difficulty:'hard',   type:'grid' },
];

const PILOT_TARGET_PER_SLOT = 2;
const MAX_PER_CALL           = 5;
const MODEL                  = 'claude-sonnet-4-6';
const PILOT_TOTAL            = PILOT_SLOTS.length * PILOT_TARGET_PER_SLOT;

const RW_DIFFICULTY_INSTRUCTIONS = {
  easy: `Difficulty: Easy
- The correct answer must be clearly supported by the passage through comprehension, not simple keyword matching.
- Avoid trivial paraphrase questions where the first sentence directly restates the answer verbatim.
- Distractors must be plausible but distinguishable with careful reading.
- Use normal academic vocabulary. Do not use obscure or unusual words.`,
  medium: `Difficulty: Medium
- Require moderate inference, synthesis, or contextual interpretation to identify the correct answer.
- Context clues supporting the answer may be distributed across multiple parts of the passage.
- Distractors should reflect plausible partial readings, scope errors, or overgeneralizations.`,
  hard: `Difficulty: Hard
- Difficulty must come primarily from subtle reasoning, close distractors, nuanced context, or synthesis across the passage.
- Do NOT create difficulty by using obscure or low-frequency vocabulary.
- Prefer high-utility academic vocabulary that a college-bound student would encounter.
- Avoid unnecessary lexical density in passage or question stem.
- Distractors must be genuinely close: each should represent a plausible misreading or flawed reasoning path.`,
};

const MATH_DIFFICULTY_INSTRUCTIONS = {
  easy: `Difficulty: Easy
- Test direct application of one core concept.
- Limit computation steps.
- Avoid unnecessary traps or ambiguous conditions.
- All values and relationships in the problem must be mutually consistent.`,
  medium: `Difficulty: Medium
- Require multiple linked steps or selection of the correct method.
- Include plausible error paths that distractors should represent.
- All values and relationships must be mutually consistent.`,
  hard: `Difficulty: Hard
- Require deeper reasoning, non-obvious problem setup, or multiple dependent steps.
- Difficulty must NOT come from malformed, ambiguous, or contradictory conditions.
- All supplied values and geometric or algebraic relationships MUST be internally consistent.
- Before finalizing: recompute the answer, confirm all supplied values are mutually consistent,
  confirm any geometry describes a valid configuration, and confirm exactly one answer follows.
- If you detect any inconsistency while generating: discard that candidate and generate a new valid problem.
- Do NOT output a repaired or intended answer. Do NOT explain the inconsistency in the explanation field.`,
};

const DISTRACTOR_REQUIREMENT = `Distractor design:
- Provide exactly one defensible correct answer.
- Each of the three wrong options must correspond to a plausible student error:
  misreading, scope error, wrong inference, common calculation mistake,
  overgeneralization, or partially correct reasoning.
- Do not use obviously irrelevant filler options.
- The explanation field must explain the correct solution cleanly.
  Do NOT expose internal reasoning, self-correction, or generation process in the explanation.`;

const TOPIC_DIVERSITY_REQUIREMENT = (count) =>
  count > 1
    ? `Topic diversity: Each of the ${count} questions must use a clearly different topic, scenario, or context from the others. Do not generate two questions about the same subject.`
    : '';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WAIT_ARTIFACT_REGEX =
  /\bwait\s*[\u2014\u2013\-,:;]\s*(?:let me|i need to|recompute|recheck|reconsider|try|use)/i;

// -- Broader self-correction regex (explanation field only) ------------------
// Catches additional generation-process leakage observed in B2I failures:
//   "Hmm -- let me choose cleaner numbers"  (B2I Q2 exact failure)
//   "Let me restate:" / "Let me revise" / "Let me choose" / "Let me rework"
//   "use cleaner numbers" / "rework the problem"
// Verb whitelist is narrow: "Let me define/calculate/substitute" NOT matched.
// ARTIFACT HYGIENE ONLY: does not verify mathematical correctness.
const SELF_CORRECTION_REGEX =
  /\b(?:hmm|hm)\s*[\u2014\u2013\-,;]|let me\s+(?:restate|revise|choose|rework|try again)|(?:use cleaner numbers|change the values|rework the problem)/i;

function parseNumericAnswer(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const fractionMatch = s.match(/^(-?\d+)\/(-?\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const den = parseInt(fractionMatch[2], 10);
    if (den === 0) return null;
    return num / den;
  }
  const n = Number(s);
  if (isNaN(n)) return null;
  return n;
}

const EXPLICIT_ANSWER_PATTERNS = [
  /\bthe answer is\s+([\d.\/\-]+)/gi,
  /\bthe correct answer is\s+([\d.\/\-]+)/gi,
  /\btherefore,?\s+the answer is\s+([\d.\/\-]+)/gi,
  /\bthus,?\s+the answer is\s+([\d.\/\-]+)/gi,
];
const NUMERIC_TOLERANCE = 1e-9;

function checkExplicitAnswerConsistency(q, slot) {
  if (slot.section !== 'math' || slot.type !== 'grid') return null;
  const expected = parseNumericAnswer(q.answer);
  if (expected === null) return null;
  const explanation = q.explanation || '';
  for (const pattern of EXPLICIT_ANSWER_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(explanation)) !== null) {
      const detected = parseNumericAnswer(match[1]);
      if (detected !== null && Math.abs(detected - expected) > NUMERIC_TOLERANCE) {
        return '[answer_consistency_reject] answer field "' + q.answer + '" contradicts explanation conclusion "' + match[0].trim() + '" (detected: ' + match[1] + ')';
      }
    }
  }
  return null;
}

const EXPLANATION_ARTIFACT_PATTERNS = [
  'Let me recheck', 'Let me reconsider',
  'Let me use a cleaner', 'Let me try a different',
  'I need to reconsider', 'Actually, I made', 'I made an error',
  'Reinterpreting',
  'use a cleaner system', 'a cleaner problem', 'cleaner version',
  'Try a different', 'revised problem', 'intended problem',
  'intended answer', 'The intended answer', 'Correct intended problem',
  'both solutions are positive', 'both values are positive',
  'both are positive', 'both values are valid', 'both are valid',
  'no unique answer', 'no unique solution',
  'ambiguous', 'inconsistent', 'contradiction',
  'This works perfectly', 'This works nicely', 'final intended',
];

const QUESTION_ARTIFACT_PATTERNS = [
  'Let me recheck', 'Let me reconsider',
  'I made an error', 'Reinterpreting',
];

const ARTIFACT_PATTERNS = [
  ...new Set([...EXPLANATION_ARTIFACT_PATTERNS, ...QUESTION_ARTIFACT_PATTERNS]),
];

function containsGenerationArtifacts(q) {
  const explanation = q.explanation || '';
  // Pass 1: WAIT regex -- catches spacing variants (explanation field only)
  const waitMatch = WAIT_ARTIFACT_REGEX.exec(explanation);
  if (waitMatch) return waitMatch[0];
  // Pass 2: SELF_CORRECTION regex -- broader leakage detection (B2I Q2: "Hmm -- let me choose")
  const selfMatch = SELF_CORRECTION_REGEX.exec(explanation);
  if (selfMatch) return selfMatch[0];
  for (const pattern of EXPLANATION_ARTIFACT_PATTERNS) {
    if (explanation.includes(pattern)) return pattern;
  }
  const question = q.question || '';
  for (const pattern of QUESTION_ARTIFACT_PATTERNS) {
    if (question.includes(pattern)) return pattern;
  }
  return null;
}

// -- Shared JSON response contract -------------------------------------------
// Applied to both RW and Math prompts. Shared to avoid divergence.
// extractAndParseJSON() enforces this contract on every model response.
const JSON_RESPONSE_CONTRACT =
  'Your entire response must be one valid JSON array. ' +
  'The first non-whitespace character must be [ and the last non-whitespace character must be ]. ' +
  'Do not include markdown fences, notes, verification commentary, or any text outside the JSON array.';


function buildPrompt(slot, count) {
  if (slot.section === 'rw') {
    const diffInstruction  = RW_DIFFICULTY_INSTRUCTIONS[slot.difficulty];
    const topicInstruction = TOPIC_DIVERSITY_REQUIREMENT(count);
    return `Generate exactly ${count} Digital SAT Reading and Writing question(s).\nSection: Reading and Writing\nDomain: ${slot.domain}\nSkill: ${slot.skill}\n${diffInstruction}\nType: Multiple choice (MCQ)\nEach question must include a short passage (30-80 words) from literature, history, science, or social science.\n${DISTRACTOR_REQUIREMENT}\n${topicInstruction}\n${JSON_RESPONSE_CONTRACT}\nSchema: [{ "section":"rw","type":"mcq","difficulty":"${slot.difficulty}","domain":"${slot.domain}","skill":"${slot.skill}","passage":"string","passageSource":"string","question":"string","options":["A...","B...","C...","D..."],"answer":"A|B|C|D","explanation":"string" }]`;
  }
  const diffInstruction  = MATH_DIFFICULTY_INSTRUCTIONS[slot.difficulty];
  const topicInstruction = TOPIC_DIVERSITY_REQUIREMENT(count);
  const typeDesc = slot.type === 'grid'
    ? 'Student-produced response (grid-in). options must be null. answer must be a number string.'
    : `Multiple choice (MCQ). options must be an array of 4 strings. answer must be A, B, C, or D.\n${DISTRACTOR_REQUIREMENT}`;
  return `Generate exactly ${count} Digital SAT Math question(s).\nSection: Math\nDomain: ${slot.domain}\nSkill: ${slot.skill}\n${diffInstruction}\nType: ${typeDesc}\n${topicInstruction}\n${JSON_RESPONSE_CONTRACT}\nSchema: [{ "section":"math","type":"${slot.type}","difficulty":"${slot.difficulty}","domain":"${slot.domain}","skill":"${slot.skill}","question":"string","options":${slot.type === 'grid' ? 'null' : '["A...","B...","C...","D..."]'},"answer":"<value>","explanation":"string" }]`;
}

const REQUIRED_FIELDS = {
  rw:   ['section','type','difficulty','domain','skill','passage','question','options','answer','explanation'],
  math: ['section','type','difficulty','domain','skill','question','answer','explanation'],
};

function validateQuestion(q, slot) {
  const required = REQUIRED_FIELDS[slot.section];
  const missing  = required.filter(f => !(f in q) || q[f] === null || q[f] === undefined || q[f] === '');
  if (missing.length > 0) throw new Error(`Missing fields: [${missing.join(', ')}]`);
  if (q.type === 'grid') {
    if (Array.isArray(q.options) && q.options.length > 0) throw new Error('Grid-in must not have options');
  } else {
    if (!Array.isArray(q.options) || q.options.length === 0) throw new Error('MCQ must have non-empty options array');
  }
  if (q.section    !== slot.section)    throw new Error(`section mismatch: got ${q.section}`);
  if (q.difficulty !== slot.difficulty) throw new Error(`difficulty mismatch: got ${q.difficulty}`);
  if (q.type       !== slot.type)       throw new Error(`type mismatch: got ${q.type}`);
}

async function isDuplicate(questionText) {
  const prefix  = questionText.substring(0, 120).trim();
  const escaped = escapeRegExp(prefix);
  const existing = await Question.findOne({ question: { $regex: `^${escaped}` } }).lean();
  return !!existing;
}

async function generateForSlot(client, slot, count, slotNum, totalSlots) {
  const prompt = buildPrompt(slot, count);
  const t0     = Date.now();
  const message = await client.messages.create({ model:MODEL, max_tokens:16000, messages:[{ role:'user', content:prompt }] });
  const elapsed    = ((Date.now()-t0)/1000).toFixed(1);
  const stopReason = message.stop_reason;
  console.log(`  [slot ${slotNum}/${totalSlots}] ${slot.section}/${slot.domain}/${slot.skill}/${slot.difficulty}/${slot.type} stop_reason=${stopReason} duration=${elapsed}s`);
  if (stopReason === 'max_tokens') throw new Error('Generation truncated (max_tokens) -- slot will retain existing count');
  const raw = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let parsed;
  try { parsed = extractAndParseJSON(raw, slot); }
  catch (err) { saveDebugResponse(raw, slot, err); throw new Error(err.message + ' -- slot will retain existing count'); }
  return parsed;
}

function extractAndParseJSON(raw, slot) {
  let stripped = raw.trim();
  const fm = stripped.match(/^```(?:json)?\n?([\s\S]*?)\n?```$/);
  if (fm) { stripped = fm[1].trim(); }
  if (!stripped.startsWith('[') || !stripped.endsWith(']')) {
    const first = stripped.length > 0 ? stripped[0] : '(empty)';
    const last  = stripped.length > 0 ? stripped[stripped.length - 1] : '(empty)';
    throw new Error('[contract_violation] Response does not start with [ and end with ]. First: "' + first + '", Last: "' + last + '", chars: ' + raw.length);
  }
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch (err) { throw new Error('[json_parse_failed] ' + err.message + ' -- total chars: ' + raw.length); }
  if (!Array.isArray(parsed)) throw new Error('[not_array] Parsed JSON is ' + typeof parsed + ', expected array');
  return parsed;
}

function saveDebugResponse(raw, slot, err) {
  const safeSkill = (slot.skill || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  const debugPath = '/tmp/seedbank_debug_' + Date.now() + '_' + safeSkill + '.txt';
  try {
    writeFileSync(debugPath, raw, 'utf8');
    console.warn('  [debug] raw response saved to ' + debugPath + ' (' + raw.length + ' chars, session-local, not committed)');
    console.warn('  [debug] parse/contract error: ' + err.message);
  } catch { /* ignore -- original error rethrown by caller */ }
}

async function buildSeedPlan() {
  const plan = [];
  for (const slot of PILOT_SLOTS) {
    const existing = await Question.countDocuments({ section:slot.section, domain:slot.domain, skill:slot.skill, difficulty:slot.difficulty, type:slot.type });
    const needed = Math.max(0, PILOT_TARGET_PER_SLOT - existing);
    if (needed > 0) { plan.push({ slot, needed, existing }); }
    else { console.log(`  [skip] ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type} -- already has ${existing}/${PILOT_TARGET_PER_SLOT}`); }
  }
  return plan;
}

function dryRun() {
  console.log('\n=== DRY RUN -- No API calls, no DB writes ===\n');
  console.log(`Model:               ${MODEL}`);
  console.log(`Target per slot:     ${PILOT_TARGET_PER_SLOT}`);
  console.log(`Max questions/call:  ${MAX_PER_CALL}`);
  console.log(`Total slots:         ${PILOT_SLOTS.length}`);
  console.log(`Total questions:     ${PILOT_TOTAL}`);
  console.log(`Total Claude calls:  ${PILOT_SLOTS.length} (one per slot, no slots mixed)`);
  console.log(`Questions per call:  ${Math.min(MAX_PER_CALL, PILOT_TARGET_PER_SLOT)}`);
  console.log(`Entry status:        structurally_validated`);
  const rwSlots = PILOT_SLOTS.filter(s => s.section === 'rw');
  const mathSlots = PILOT_SLOTS.filter(s => s.section === 'math');
  console.log(`\nRW questions:   ${rwSlots.length * PILOT_TARGET_PER_SLOT}`);
  console.log(`Math questions: ${mathSlots.length * PILOT_TARGET_PER_SLOT}`);
  for (const diff of ['easy','medium','hard']) console.log(`  ${diff}: ${PILOT_SLOTS.filter(s=>s.difficulty===diff).length*PILOT_TARGET_PER_SLOT}`);
  console.log(`\nMath MCQ:  ${mathSlots.filter(s=>s.type==='mcq').length*PILOT_TARGET_PER_SLOT}`);
  console.log(`Math grid: ${mathSlots.filter(s=>s.type==='grid').length*PILOT_TARGET_PER_SLOT}`);
  const dc = {};
  for (const s of PILOT_SLOTS) dc[s.domain] = (dc[s.domain] || 0) + PILOT_TARGET_PER_SLOT;
  console.log('\nBy domain:');
  for (const [d,c] of Object.entries(dc).sort()) console.log(`  ${d}: ${c}`);
  console.log(`\nCall plan (${Math.min(MAX_PER_CALL,PILOT_TARGET_PER_SLOT)} questions/call, one slot per call):`);
  PILOT_SLOTS.forEach((slot,i) => console.log(`  Call ${i+1}: ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type} x${PILOT_TARGET_PER_SLOT}`));
  console.log('\n=== END DRY RUN ===');
}

async function statusReport() {
  console.log('\n=== BANK STATUS ===\n');
  let totalAll = 0;
  for (const slot of PILOT_SLOTS) {
    const all = await Question.countDocuments({ section:slot.section, domain:slot.domain, skill:slot.skill, difficulty:slot.difficulty, type:slot.type });
    totalAll += all;
    const pct = Math.round((all / PILOT_TARGET_PER_SLOT) * 100);
    const bar = '\u2588'.repeat(Math.min(Math.round(pct/10),10)) + '\u2591'.repeat(Math.max(10-Math.round(pct/10),0));
    console.log(`  [${bar}] ${all}/${PILOT_TARGET_PER_SLOT} ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type}`);
  }
  console.log(`\nTotal in bank: ${totalAll} / ${PILOT_TOTAL}`);
  console.log('=== END STATUS ===\n');
}

async function seed() {
  console.log('\n[seedBank] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[seedBank] Connected.');
  const plan = await buildSeedPlan();
  if (plan.length === 0) { console.log('[seedBank] All slots already at target. Nothing to generate.'); await mongoose.disconnect(); return; }
  const totalNeeded = plan.reduce((s, p) => s + p.needed, 0);
  console.log(`\n[seedBank] Plan: ${plan.length} slot(s) need questions, ${totalNeeded} total to generate`);
  console.log('[seedBank] Each Claude call targets ONE slot only -- no slots mixed\n');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let totalInserted = 0, totalSkipped = 0, totalCallErrors = 0, slotNum = 0;
  for (const { slot, needed } of plan) {
    slotNum++;
    let remaining = needed, insertedThisSlot = 0;
    while (remaining > 0) {
      const requestCount = Math.min(MAX_PER_CALL, remaining);
      let generatedQuestions;
      try { generatedQuestions = await generateForSlot(client, slot, requestCount, slotNum, plan.length); }
      catch (err) { console.error(`  [call_error] slot=${slot.skill}/${slot.difficulty}/${slot.type}: ${err.message}`); totalCallErrors++; break; }
      if (generatedQuestions.length !== requestCount) { console.warn(`  [count_mismatch] slot=${slot.skill}/${slot.difficulty}/${slot.type}: requested=${requestCount} received=${generatedQuestions.length} -- 0 inserted, slot unchanged, retry on next run`); totalCallErrors++; break; }
      for (const q of generatedQuestions) {
        try { validateQuestion(q, slot); }
        catch (err) { console.warn(`  [validation_fail] ${slot.skill}/${slot.difficulty}: ${err.message}`); totalSkipped++; continue; }
        const artifact = containsGenerationArtifacts(q);
        if (artifact) { console.warn(`  [artifact_reject] ${slot.skill}/${slot.difficulty}: matched pattern "${artifact}"`); totalSkipped++; continue; }
        const consistency = checkExplicitAnswerConsistency(q, slot);
        if (consistency) { console.warn(`  [answer_consistency_reject] ${slot.skill}/${slot.difficulty}: ${consistency}`); totalSkipped++; continue; }
        const dup = await isDuplicate(q.question);
        if (dup) { console.warn(`  [duplicate_skip] ${slot.skill}/${slot.difficulty}: already exists`); totalSkipped++; continue; }
        try {
          await Question.create({ section:slot.section, domain:slot.domain, skill:slot.skill, difficulty:slot.difficulty, type:slot.type, passage:q.passage||null, passageSource:q.passageSource||null, question:q.question, options:q.options||null, answer:q.answer, explanation:q.explanation, status:'structurally_validated', version:1, generatedByModel:MODEL, generatedAt:new Date(), useCount:0, lastUsedAt:null });
          insertedThisSlot++; totalInserted++; remaining--;
          console.log(`  [inserted] ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type} (slot: ${insertedThisSlot}/${needed}, total: ${totalInserted})`);
        } catch (err) { console.error(`  [db_error] ${slot.skill}/${slot.difficulty}: ${err.message}`); totalSkipped++; }
      }
      
    }
  }
  console.log(`\n[seedBank] Complete.\n  inserted: ${totalInserted}\n  skipped: ${totalSkipped}\n  call_errors: ${totalCallErrors}\n  total in bank: ${await Question.countDocuments()}`);
  await mongoose.disconnect();
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    dryRun();
  } else if (args.includes('--status')) {
    (async () => {
      await mongoose.connect(process.env.MONGODB_URI);
      await statusReport();
      await mongoose.disconnect();
    })();
  } else {
    seed().catch(err => {
      console.error('[seedBank] Fatal:', err.message);
      process.exit(1);
    });
  }
}

export {
  PILOT_SLOTS, PILOT_TARGET_PER_SLOT, PILOT_TOTAL, MAX_PER_CALL,
  RW_DIFFICULTY_INSTRUCTIONS, MATH_DIFFICULTY_INSTRUCTIONS,
  DISTRACTOR_REQUIREMENT, TOPIC_DIVERSITY_REQUIREMENT,
  ARTIFACT_PATTERNS, EXPLANATION_ARTIFACT_PATTERNS, QUESTION_ARTIFACT_PATTERNS,
  WAIT_ARTIFACT_REGEX,
  SELF_CORRECTION_REGEX,
  EXPLICIT_ANSWER_PATTERNS,
  containsGenerationArtifacts,
  parseNumericAnswer,
  checkExplicitAnswerConsistency,
  JSON_RESPONSE_CONTRACT,
  escapeRegExp, extractAndParseJSON, saveDebugResponse,
  buildPrompt, validateQuestion, isDuplicate,
  buildSeedPlan, dryRun,
};
