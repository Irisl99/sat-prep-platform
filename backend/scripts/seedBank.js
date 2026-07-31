/**
 * scripts/seedBank.js
 *
 * Pilot question-bank seeding script.
 * Generates 94 SAT-style questions for CONTENT QUALITY VALIDATION only.
 * Questions enter at status: "structurally_validated" — never "active".
 *
 * Usage:
 *   node scripts/seedBank.js            # full run
 *   node scripts/seedBank.js --dry-run  # show plan, no API/DB calls
 *   node scripts/seedBank.js --status   # show existing bank counts
 *
 * Batching:
 *   Each Claude API call is for ONE slot only (section/domain/skill/difficulty/type).
 *   No slots are mixed in a single prompt — each call has unambiguous requirements.
 *   MAX_PER_CALL is a ceiling on questions per call.
 *   Total calls = number of slots needing generation (max 47 for a fresh run).
 *
 * Safety:
 *   - Idempotent: skips slots already at target count
 *   - Only SUCCESSFULLY INSERTED questions count toward remaining needed
 *   - Failed calls leave slot remaining unchanged
 *   - Duplicate detection with regex-safe escaping before DB query
 *   - Call failure is isolated — other slots continue
 *   - No secrets logged
 */

import 'dotenv/config';
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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPrompt(slot, count) {
  const diffDesc = {
    easy:   'easy difficulty (accessible to students scoring 400-550)',
    medium: 'medium difficulty (appropriate for students scoring 550-700)',
    hard:   'hard difficulty (challenging for students scoring 700-800)',
  }[slot.difficulty];

  if (slot.section === 'rw') {
    return `Generate exactly ${count} Digital SAT Reading and Writing question(s).
Section: Reading and Writing
Domain: ${slot.domain}
Skill: ${slot.skill}
Difficulty: ${diffDesc}
Type: Multiple choice (MCQ)
Each question must include a short passage (30-80 words) from literature, history, science, or social science.
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"rw","type":"mcq","difficulty":"${slot.difficulty}","domain":"${slot.domain}","skill":"${slot.skill}","passage":"string","passageSource":"string","question":"string","options":["A...","B...","C...","D..."],"answer":"A"|"B"|"C"|"D","explanation":"string" }]`;
  }

  const typeDesc = slot.type === 'grid'
    ? 'Student-produced response (grid-in). options must be null. answer must be a number string.'
    : 'Multiple choice (MCQ). options must be an array of 4 strings. answer must be A, B, C, or D.';

  return `Generate exactly ${count} Digital SAT Math question(s).
Section: Math
Domain: ${slot.domain}
Skill: ${slot.skill}
Difficulty: ${diffDesc}
Type: ${typeDesc}
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"math","type":"${slot.type}","difficulty":"${slot.difficulty}","domain":"${slot.domain}","skill":"${slot.skill}","question":"string","options":${slot.type === 'grid' ? 'null' : '["A...","B...","C...","D..."]'},"answer":"${slot.type === 'grid' ? '<number_string>' : 'A|B|C|D'}","explanation":"string" }]`;
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
    if (Array.isArray(q.options) && q.options.length > 0)
      throw new Error('Grid-in must not have options');
  } else {
    if (!Array.isArray(q.options) || q.options.length === 0)
      throw new Error('MCQ must have non-empty options array');
  }

  if (q.section    !== slot.section)    throw new Error(`section mismatch: got ${q.section}`);
  if (q.difficulty !== slot.difficulty) throw new Error(`difficulty mismatch: got ${q.difficulty}`);
  if (q.type       !== slot.type)       throw new Error(`type mismatch: got ${q.type}`);
}

async function isDuplicate(questionText) {
  const prefix  = questionText.substring(0, 120).trim();
  const escaped = escapeRegExp(prefix);
  const existing = await Question.findOne({
    question: { $regex: `^${escaped}` },
  }).lean();
  return !!existing;
}

async function generateForSlot(client, slot, count, slotNum, totalSlots) {
  const prompt = buildPrompt(slot, count);
  const t0     = Date.now();

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 16000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const elapsed    = ((Date.now() - t0) / 1000).toFixed(1);
  const stopReason = message.stop_reason;

  console.log(`  [slot ${slotNum}/${totalSlots}] ${slot.section}/${slot.domain}/${slot.skill}/${slot.difficulty}/${slot.type} stop_reason=${stopReason} duration=${elapsed}s`);

  if (stopReason === 'max_tokens') {
    throw new Error(`Generation truncated (max_tokens) — slot retains existing count`);
  }

  const raw   = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message} — slot retains existing count`);
  }

  if (!Array.isArray(parsed)) throw new Error(`Response is not an array — slot retains existing count`);

  return parsed;
}

async function buildSeedPlan() {
  const plan = [];
  for (const slot of PILOT_SLOTS) {
    const existing = await Question.countDocuments({
      section:    slot.section,
      domain:     slot.domain,
      skill:      slot.skill,
      difficulty: slot.difficulty,
      type:       slot.type,
    });
    const needed = Math.max(0, PILOT_TARGET_PER_SLOT - existing);
    if (needed > 0) {
      plan.push({ slot, needed, existing });
    } else {
      console.log(`  [skip] ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type} — already has ${existing}/${PILOT_TARGET_PER_SLOT}`);
    }
  }
  return plan;
}

function dryRun() {
  console.log('\n=== DRY RUN — No API calls, no DB writes ===\n');
  console.log(`Model:               ${MODEL}`);
  console.log(`Target per slot:     ${PILOT_TARGET_PER_SLOT}`);
  console.log(`Max questions/call:  ${MAX_PER_CALL}`);
  console.log(`Total slots:         ${PILOT_SLOTS.length}`);
  console.log(`Total questions:     ${PILOT_TOTAL}`);
  console.log(`Total Claude calls:  ${PILOT_SLOTS.length} (one per slot, no slots mixed)`);
  console.log(`Questions per call:  ${Math.min(MAX_PER_CALL, PILOT_TARGET_PER_SLOT)}`);
  console.log(`Entry status:        structurally_validated`);
  console.log();

  const rwSlots   = PILOT_SLOTS.filter(s => s.section === 'rw');
  const mathSlots = PILOT_SLOTS.filter(s => s.section === 'math');
  console.log(`RW questions:   ${rwSlots.length   * PILOT_TARGET_PER_SLOT}`);
  console.log(`Math questions: ${mathSlots.length * PILOT_TARGET_PER_SLOT}`);
  console.log();

  for (const diff of ['easy', 'medium', 'hard']) {
    const n = PILOT_SLOTS.filter(s => s.difficulty === diff).length * PILOT_TARGET_PER_SLOT;
    console.log(`  ${diff}: ${n}`);
  }
  console.log();

  const mathMcq  = mathSlots.filter(s => s.type === 'mcq').length  * PILOT_TARGET_PER_SLOT;
  const mathGrid = mathSlots.filter(s => s.type === 'grid').length * PILOT_TARGET_PER_SLOT;
  console.log(`Math MCQ:  ${mathMcq}`);
  console.log(`Math grid: ${mathGrid}`);
  console.log();

  const domainCounts = {};
  for (const s of PILOT_SLOTS) {
    domainCounts[s.domain] = (domainCounts[s.domain] || 0) + PILOT_TARGET_PER_SLOT;
  }
  console.log('By domain:');
  for (const [domain, count] of Object.entries(domainCounts).sort()) {
    console.log(`  ${domain}: ${count}`);
  }
  console.log();
  console.log(`Call plan (${Math.min(MAX_PER_CALL, PILOT_TARGET_PER_SLOT)} questions/call, one slot per call):`);
  PILOT_SLOTS.forEach((slot, i) => {
    console.log(`  Call ${i+1}: ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type} x${PILOT_TARGET_PER_SLOT}`);
  });
  console.log('\n=== END DRY RUN ===');
}

async function statusReport() {
  console.log('\n=== BANK STATUS ===\n');
  let totalAll = 0;
  for (const slot of PILOT_SLOTS) {
    const all = await Question.countDocuments({
      section: slot.section, domain: slot.domain,
      skill: slot.skill, difficulty: slot.difficulty, type: slot.type,
    });
    totalAll += all;
    const pct = Math.round((all / PILOT_TARGET_PER_SLOT) * 100);
    const bar = '█'.repeat(Math.min(Math.round(pct / 10), 10)) +
                '░'.repeat(Math.max(10 - Math.round(pct / 10), 0));
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
  if (plan.length === 0) {
    console.log('[seedBank] All slots already at target. Nothing to generate.');
    await mongoose.disconnect();
    return;
  }

  const totalNeeded = plan.reduce((s, p) => s + p.needed, 0);
  console.log(`\n[seedBank] Plan: ${plan.length} slot(s) need questions, ${totalNeeded} total to generate`);
  console.log(`[seedBank] Each Claude call targets ONE slot only — no slots mixed\n`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let totalInserted   = 0;
  let totalSkipped    = 0;
  let totalCallErrors = 0;
  let slotNum         = 0;

  for (const { slot, needed } of plan) {
    slotNum++;
    let remaining        = needed;
    let insertedThisSlot = 0;

    while (remaining > 0) {
      const requestCount = Math.min(MAX_PER_CALL, remaining);

      let generatedQuestions;
      try {
        generatedQuestions = await generateForSlot(client, slot, requestCount, slotNum, plan.length);
      } catch (err) {
        // Failed call: remaining is NOT reduced — slot retains existing count
        console.error(`  [call_error] slot=${slot.skill}/${slot.difficulty}/${slot.type}: ${err.message}`);
        totalCallErrors++;
        break;
      }

      for (const q of generatedQuestions) {
        try {
          validateQuestion(q, slot);
        } catch (err) {
          console.warn(`  [validation_fail] ${slot.skill}/${slot.difficulty}: ${err.message}`);
          totalSkipped++;
          continue;
        }

        const dup = await isDuplicate(q.question);
        if (dup) {
          console.warn(`  [duplicate_skip] ${slot.skill}/${slot.difficulty}: already exists`);
          totalSkipped++;
          continue;
        }

        try {
          await Question.create({
            section:          slot.section,
            domain:           slot.domain,
            skill:            slot.skill,
            difficulty:       slot.difficulty,
            type:             slot.type,
            passage:          q.passage       || null,
            passageSource:    q.passageSource || null,
            question:         q.question,
            options:          q.options       || null,
            answer:           q.answer,
            explanation:      q.explanation,
            status:           'structurally_validated',
            version:          1,
            generatedByModel: MODEL,
            generatedAt:      new Date(),
            useCount:         0,
            lastUsedAt:       null,
          });

          // Only decrement remaining on confirmed successful insert
          insertedThisSlot++;
          totalInserted++;
          remaining--;
          console.log(`  [inserted] ${slot.section}/${slot.skill}/${slot.difficulty}/${slot.type} (slot: ${insertedThisSlot}/${needed}, total: ${totalInserted})`);

        } catch (err) {
          console.error(`  [db_error] ${slot.skill}/${slot.difficulty}: ${err.message}`);
          totalSkipped++;
        }
      }

      if (generatedQuestions.length < requestCount) {
        console.warn(`  [short_response] requested=${requestCount} received=${generatedQuestions.length} — retry on next run`);
        break;
      }
    }
  }

  console.log(`\n[seedBank] Complete.`);
  console.log(`  inserted:     ${totalInserted}`);
  console.log(`  skipped:      ${totalSkipped}`);
  console.log(`  call_errors:  ${totalCallErrors}`);
  console.log(`  total in bank: ${await Question.countDocuments()}`);
  await mongoose.disconnect();
}

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

export {
  PILOT_SLOTS, PILOT_TARGET_PER_SLOT, PILOT_TOTAL, MAX_PER_CALL,
  escapeRegExp, buildPrompt, validateQuestion, isDuplicate,
  buildSeedPlan, dryRun,
};
