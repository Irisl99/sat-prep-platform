/**
 * backend/scripts/generateRWCandidates.mjs
 *
 * RW candidate generation CLI.
 * Mirrors generateMathCandidates.mjs for the Reading & Writing section.
 *
 * NEVER calls Question.create().
 * NEVER modifies existing Question documents or statuses.
 * NEVER writes to the import manifest.
 * MongoDB is READ-ONLY (duplicate detection only).
 *
 * Usage:
 *   node scripts/generateRWCandidates.mjs --all-rw-slots
 *   node scripts/generateRWCandidates.mjs --slot "rw/Craft and Structure/Words in Context/easy/mcq"
 *   node scripts/generateRWCandidates.mjs --all-rw-slots --dry-run
 */

import 'dotenv/config';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';

import {
  PILOT_SLOTS,
  PILOT_TARGET_PER_SLOT,
  buildPrompt,
  extractAndParseJSON,
  saveDebugResponse,
  validateQuestion,
  containsGenerationArtifacts,
  isDuplicate,
} from './seedBank.js';

import {
  resolveGeneratorVersion,
  slotKey,
  parseSlotArg,
  makeSkillSlug,
  makeCandidateId,
  countPendingCandidates,
  readManifestEntries,
  countReviewedInMongoDB,
  computeNeeded,
  writeCandidateFile,
} from './generateMathCandidates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Constants ─────────────────────────────────────────────────
const PROMPT_VERSION      = 'rw-prompt-v1';
const REVIEW_VERSION      = 'rw-review-v1';
const DEFAULT_CAND_DIR    = join(__dirname, '..', 'data', 'rw-candidates');
const DEFAULT_MANIFEST    = join(__dirname, '..', 'data', 'rw-imports', 'imported-candidates.json');
const DEFAULT_REVIEW_DIR  = join(__dirname, '..', 'data', 'rw-reviews');

const VALID_PASSAGE_SOURCES = new Set([
  'Literature',
  'History/Social Studies',
  'Science',
  'Social Science',
]);

// ── RW local validation layer ─────────────────────────────────
// Applied after shared validateQuestion(), before adding to candidates[].
// Returns null if valid, or { gate, reason } if rejected.
export function validateRWCandidate(candidate) {
  // Gate 1: passage_missing
  if (!candidate.passage || typeof candidate.passage !== 'string' || candidate.passage.trim() === '') {
    return { gate: 'passage_missing', reason: 'passage field is missing or empty' };
  }

  // Gate 2: passage_length (30–80 words, whitespace-based MVP count)
  const wordCount = candidate.passage.trim().split(/\s+/).length;
  if (wordCount < 30) {
    return { gate: 'passage_length', reason: `passage has ${wordCount} words (minimum 30)` };
  }
  if (wordCount > 80) {
    return { gate: 'passage_length', reason: `passage has ${wordCount} words (maximum 80)` };
  }

  // Gate 3: passage_source_invalid
  if (!VALID_PASSAGE_SOURCES.has(candidate.passageSource)) {
    return {
      gate: 'passage_source_invalid',
      reason: `passageSource "${candidate.passageSource}" is not one of: ${[...VALID_PASSAGE_SOURCES].join(' | ')}`,
    };
  }

  // Gate 4: passage_artifact — reuse shared detector on passage field
  const passageArtifact = containsGenerationArtifacts({ explanation: candidate.passage });
  if (passageArtifact) {
    return { gate: 'passage_artifact', reason: `passage matched artifact pattern: "${passageArtifact}"` };
  }

  // Gate 5: mcq_answer_reject
  const trimmedAnswer = typeof candidate.answer === 'string' ? candidate.answer.trim() : '';
  if (!['A', 'B', 'C', 'D'].includes(trimmedAnswer)) {
    return { gate: 'mcq_answer_reject', reason: `answer "${candidate.answer}" must be exactly A, B, C, or D` };
  }

  // Gate 6: mcq_options_missing — exactly four non-empty options labeled A, B, C, D in order
  if (!Array.isArray(candidate.options) || candidate.options.length !== 4) {
    return { gate: 'mcq_options_missing', reason: `options must be an array of exactly 4 choices, got ${Array.isArray(candidate.options) ? candidate.options.length : typeof candidate.options}` };
  }
  const expectedLabels = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 4; i++) {
    const opt = candidate.options[i];
    if (!opt || typeof opt !== 'string' || opt.trim() === '') {
      return { gate: 'mcq_options_missing', reason: `option ${i} is empty or missing` };
    }
    if (!opt.trim().startsWith(expectedLabels[i])) {
      return { gate: 'mcq_options_missing', reason: `option ${i} must start with label ${expectedLabels[i]}, got: "${opt.substring(0,10)}"` };
    }
  }

  return null; // all gates passed
}

// ── Build empty review block ──────────────────────────────────
export function makeRWReviewBlock() {
  return {
    reviewVersion:          REVIEW_VERSION,
    decision:               null,
    correctAnswer:          null,
    uniqueAnswer:           null,
    passageAppropriate:     null,
    passageSourceAccurate:  null,
    explanationCorrect:     null,
    skillTagCorrect:        null,
    difficultyCorrect:      null,
    reviewer:               null,
    reviewerNotes:          null,
    reviewedAt:             null,
    reviewedContent:        null,
  };
}

// ── Generate one RW slot ──────────────────────────────────────
export async function generateRWSlot(client, slot, generatorVersion, candidateDir, manifestPath, requestCount = PILOT_TARGET_PER_SLOT) {
  const label = slotKey(slot);
  console.log(`\n[generate] ${label}`);
  const ts = Date.now().toString();
  const t0 = Date.now();

  let message;
  try {
    message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: buildPrompt(slot, requestCount) }],
    });
  } catch (err) {
    console.error(`  [api_error] ${label}: ${err.message}`);
    return { candidates: 0, rejected: 0, error: err.message };
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  const usage    = message.usage || {};
  console.log(`  stop_reason=${message.stop_reason} duration=${duration}s in=${usage.input_tokens} out=${usage.output_tokens}`);

  const rawText = message.content.map(b => b.type === 'text' ? b.text : '').join('');
  let parsed;
  try {
    parsed = extractAndParseJSON(rawText);
  } catch (err) {
    saveDebugResponse(rawText, slot.skill);
    console.warn(`  [parse_fail] ${err.message}`);
    return { candidates: 0, rejected: rawText.length, error: err.message };
  }

  // Exact-count gate
  if (parsed.length !== requestCount) {
    const msg = `[count_mismatch] expected=${requestCount} received=${parsed.length} — 0 candidates written`;
    console.warn(`  ${msg}`);
    return { candidates: 0, rejected: parsed.length, error: msg };
  }

  const candidatesOut = [];
  const rejectedOut   = [];

  for (let i = 0; i < parsed.length; i++) {
    const q   = parsed[i];
    const cid = makeCandidateId(slot, ts, i);

    // Shared structural validation
    let structErr;
    try { validateQuestion(q, slot); } catch (e) { structErr = e.message; }
    if (structErr) {
      console.warn(`  [struct_reject] Q${i+1}: ${structErr}`);
      rejectedOut.push({ candidateId: cid, rejectGate: 'struct_reject', rejectReason: structErr });
      continue;
    }

    // Shared artifact detection on explanation
    const expArtifact = containsGenerationArtifacts(q);
    if (expArtifact) {
      console.warn(`  [artifact_reject] Q${i+1}: "${expArtifact}"`);
      rejectedOut.push({ candidateId: cid, rejectGate: 'artifact_reject', rejectReason: `matched "${expArtifact}"` });
      continue;
    }

    // RW local validation layer
    const rwErr = validateRWCandidate(q);
    if (rwErr) {
      console.warn(`  [${rwErr.gate}] Q${i+1}: ${rwErr.reason}`);
      rejectedOut.push({ candidateId: cid, rejectGate: rwErr.gate, rejectReason: rwErr.reason });
      continue;
    }

    // Duplicate detection
    const dup = await isDuplicate(q.question);
    if (dup) {
      console.warn(`  [duplicate_reject] Q${i+1}`);
      rejectedOut.push({ candidateId: cid, rejectGate: 'duplicate_reject', rejectReason: 'question already exists in MongoDB' });
      continue;
    }

    console.log(`  [candidate] Q${i+1}: "${q.question.substring(0, 64)}"`);
    candidatesOut.push({
      candidateId:   cid,
      section:       slot.section,
      domain:        slot.domain,
      skill:         slot.skill,
      difficulty:    slot.difficulty,
      type:          slot.type,
      passage:       q.passage,
      passageSource: q.passageSource,
      question:      q.question,
      options:       q.options,
      answer:        String(q.answer).trim(),
      explanation:   q.explanation,
      review:        makeRWReviewBlock(),
    });
  }

  // Write atomic candidate file
  const fileData = {
    generatorVersion,
    promptVersion:    PROMPT_VERSION,
    generatedAt:      new Date().toISOString(),
    generatedByModel: 'claude-sonnet-4-6',
    slot: {
      section:    slot.section,
      domain:     slot.domain,
      skill:      slot.skill,
      difficulty: slot.difficulty,
      type:       slot.type,
    },
    candidates: candidatesOut,
    rejected:   rejectedOut,
  };
  writeCandidateFile(candidatesOut, rejectedOut, slot, generatorVersion, candidateDir, fileData);

  console.log(`  [file] Written: ${candidateDir} (${candidatesOut.length} candidates, ${rejectedOut.length} rejected)`);
  return { candidates: candidatesOut.length, rejected: rejectedOut.length };
}

// ── Main ──────────────────────────────────────────────────────
export async function main() {
  const args        = process.argv.slice(2);
  const dryRun      = args.includes('--dry-run');
  const allSlots    = args.includes('--all-rw-slots');
  const slotArg     = args.includes('--slot') ? args[args.indexOf('--slot') + 1] : null;
  const candDir     = process.env.RW_CANDIDATE_DIR  || DEFAULT_CAND_DIR;
  const manifestPath= process.env.RW_IMPORT_MANIFEST || DEFAULT_MANIFEST;
  const reviewDir   = process.env.RW_REVIEW_DIR     || DEFAULT_REVIEW_DIR;

  if (!allSlots && !slotArg) {
    console.error('[generateRWCandidates] Usage: --all-rw-slots | --slot "<key>" [--dry-run]');
    process.exit(1);
  }

  // Resolve target slots
  const rwSlots = PILOT_SLOTS.filter(s => s.section === 'rw');
  let targetSlots;
  if (slotArg) {
    const parsed = parseSlotArg(slotArg);
    targetSlots  = rwSlots.filter(s => slotKey(s) === slotKey(parsed));
    if (!targetSlots.length) {
      console.error(`[generateRWCandidates] Slot not found in RW blueprint: ${slotArg}`);
      process.exit(1);
    }
  } else {
    targetSlots = rwSlots;
  }

  const generatorVersion = await resolveGeneratorVersion();

  console.log('\n=== generateRWCandidates.mjs ===');
  console.log(`Generator version: ${generatorVersion}`);
  console.log(`Prompt version:    ${PROMPT_VERSION}`);
  console.log(`Candidate dir:     ${candDir}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Slots: ${targetSlots.length}`);

  if (!dryRun) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[generateRWCandidates] Connected');
    if (!existsSync(candDir)) mkdirSync(candDir, { recursive: true });
  }

  let totalCandidates = 0, totalRejected = 0, totalSkipped = 0, totalErrors = 0;
  const client = dryRun ? null : new Anthropic();

  for (const slot of targetSlots) {
    const label = slotKey(slot);

    if (dryRun) {
      console.log(`\n[dry-run] ${label} — would compute needed and generate if needed > 0`);
      totalSkipped++;
      continue;
    }

    const { inDb, pending, needed } = await computeNeeded(slot, candDir, reviewDir, manifestPath);
    if (needed === 0) {
      console.log(`[skip] ${label}`);
      totalSkipped++;
      continue;
    }

    const result = await generateRWSlot(client, slot, generatorVersion, candDir, manifestPath, needed);
    if (result.error) totalErrors++;
    totalCandidates += result.candidates || 0;
    totalRejected   += result.rejected   || 0;
  }

  const totalProcessed = totalCandidates + totalRejected;
  const acceptanceRate = totalProcessed > 0
    ? (totalCandidates / totalProcessed * 100).toFixed(1)
    : null;

  console.log(`\n=== generateRWCandidates COMPLETE ===`);
  console.log(`  candidates written:  ${totalCandidates}`);
  console.log(`  rejected:            ${totalRejected}`);
  if (acceptanceRate !== null) {
    console.log(`  acceptance rate:     ${acceptanceRate}% (${totalCandidates} / ${totalProcessed})`);
  }
  console.log(`  slots skipped:       ${totalSkipped}`);
  console.log(`  errors:              ${totalErrors}`);
  console.log(`  MongoDB inserts:     0  (for human review only)`);

  if (!dryRun) await mongoose.disconnect();
}

// ── Direct-execution guard ────────────────────────────────────
// Importing this module causes ZERO side effects:
//   0 API calls, 0 MongoDB connections, 0 file writes, 0 Question.create() calls.
const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch(err => {
    console.error('[generateRWCandidates] Fatal:', err.message);
    process.exit(1);
  });
}
