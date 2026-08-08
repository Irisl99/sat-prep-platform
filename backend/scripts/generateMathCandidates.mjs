/**
 * backend/scripts/generateMathCandidates.mjs
 *
 * Math candidate generation CLI.
 * Generates Math question candidates, runs all gates, and writes
 * candidate JSON files for human review before MongoDB insertion.
 *
 * NEVER calls Question.create().
 * NEVER modifies existing Question documents or statuses.
 * NEVER writes to the import manifest.
 *
 * Usage:
 *   node scripts/generateMathCandidates.mjs --slot "math/Algebra/Linear Equations 2-var/hard/grid"
 *   node scripts/generateMathCandidates.mjs --all-math-slots
 *   node scripts/generateMathCandidates.mjs --all-math-slots --dry-run
 *   node scripts/generateMathCandidates.mjs --slot "..." --max-candidates 1
 *
 * Environment:
 *   MATH_CANDIDATE_OUTPUT_DIR  output directory (default: backend/data/math-candidates/)
 *   MATH_REVIEW_DIR            review files directory (default: backend/data/math-reviews/)
 *   MATH_IMPORT_MANIFEST       manifest path (default: backend/data/math-imports/imported-candidates.json)
 *   PIPELINE_VERSION           override generatorVersion (overrides git hash)
 *   MONGODB_URI                required
 *   ANTHROPIC_API_KEY          required (not needed for --dry-run)
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import Question from '../src/models/Question.js';
import {
  PILOT_SLOTS,
  PILOT_TARGET_PER_SLOT,
  extractAndParseJSON,
  saveDebugResponse,
  validateQuestion,
  containsGenerationArtifacts,
  checkExplicitAnswerConsistency,
  isDuplicate,
  parseNumericAnswer,
} from './seedBank.js';
import {
  findExplanationPolicyViolation, findSetLevelDuplicate, freezeMathCandidate, findSatScopeViolation, hashMathExplanation,
  independentlyValidateMathCandidate, validateExplanationVerifierResult, validateStoredIndependentVerification,
} from '../src/services/mathCandidateValidation.js';
import {
  buildMathQuestionPrompt, createAnthropicBlindSolver, createAnthropicExplanationVerifier,
  createAnthropicVerifiedExplainer,
} from '../src/services/mathCandidatePipeline.js';

const MODEL         = 'claude-sonnet-4-6';
const TARGET_PER_SLOT = PILOT_TARGET_PER_SLOT;
const __dirname     = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CANDIDATE_DIR   = join(__dirname, '..', 'data', 'math-candidates');
const DEFAULT_REVIEW_DIR      = join(__dirname, '..', 'data', 'math-reviews');
const DEFAULT_IMPORT_MANIFEST = join(__dirname, '..', 'data', 'math-imports', 'imported-candidates.json');
const MATH_SLOTS = PILOT_SLOTS.filter(s => s.section === 'math');

export function resolveGeneratorVersion() {
  if (process.env.PIPELINE_VERSION) return process.env.PIPELINE_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['pipe','pipe','pipe'] }).toString().trim();
  } catch { return 'unknown'; }
}

export function slotKey(slot) {
  return `${slot.section}/${slot.domain}/${slot.skill}/${slot.difficulty}/${slot.type}`;
}

export function parseSlotArg(arg) {
  const parts = arg.split('/');
  if (parts.length !== 5) throw new Error(`Invalid slot format: "${arg}". Expected section/domain/skill/difficulty/type`);
  const [section, domain, skill, difficulty, type] = parts;
  const match = MATH_SLOTS.find(s =>
    s.section === section && s.domain === domain &&
    s.skill === skill && s.difficulty === difficulty && s.type === type
  );
  if (!match) throw new Error(`Slot not found in PILOT_SLOTS: "${arg}"`);
  return match;
}

export function parseMaxCandidatesArg(args) {
  const index = args.indexOf('--max-candidates');
  if (index === -1) return null;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1)
    throw new Error('--max-candidates must be a positive integer');
  return value;
}

export function makeSkillSlug(skill) {
  return skill.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
}

export function makeCandidateId(slot, timestamp, index) {
  return `math_${makeSkillSlug(slot.skill)}_${slot.difficulty}_${slot.type}_${timestamp}_${index}`;
}

export function buildIndependentRejectionEvidence(candidate, solverResult, generatedExplanation = null) {
  const frozenProblem = freezeMathCandidate(candidate);
  const solverEvidence = solverResult && typeof solverResult === 'object' ? {
    candidateHash: solverResult.candidateHash ?? null,
    status: solverResult.status ?? null,
    conditionsConsistent: solverResult.conditionsConsistent ?? null,
    domainMatch: solverResult.domainMatch ?? null,
    skillMatch: solverResult.skillMatch ?? null,
    difficultyRating: solverResult.difficultyRating ?? null,
    difficultyMatch: solverResult.difficultyMatch ?? null,
    languageUnambiguous: solverResult.languageUnambiguous ?? null,
    solutionCount: solverResult.solutionCount ?? null,
    answer: solverResult.answer ?? null,
    defensibleOptionCount: solverResult.defensibleOptionCount ?? null,
    distractorsPlausible: solverResult.distractorsPlausible ?? null,
    method: solverResult.method ?? null,
    solution: solverResult.solution ?? null,
    formatRetries: solverResult.formatRetries ?? 0,
  } : null;
  return {
    frozenProblem,
    generatorAnswer: String(candidate.answer),
    solverEvidence,
    generatedExplanation,
    note: 'Frozen problem is immutable; evidence is for audit only and must not be used to repair the candidate.',
  };
}

export function readImportedCandidateIds(manifestPath = DEFAULT_IMPORT_MANIFEST) {
  if (!existsSync(manifestPath)) return new Set();
  try {
    const entries = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(entries)) return new Set();
    return new Set(entries.map(e => e.candidateId).filter(Boolean));
  } catch { return new Set(); }
}

function scanFiles(dir, targetSlotKey) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (!data.slot || slotKey(data.slot) !== targetSlotKey) continue;
      results.push(data);
    } catch {}
  }
  return results;
}

export function countPendingCandidates(
  slot,
  candidateDir = DEFAULT_CANDIDATE_DIR,
  reviewDir    = DEFAULT_REVIEW_DIR,
  manifestPath = DEFAULT_IMPORT_MANIFEST
) {
  const importedIds = readImportedCandidateIds(manifestPath);
  const key = slotKey(slot);
  const reviewDecisions = new Map();
  for (const data of scanFiles(reviewDir, key)) {
    for (const c of (data.candidates || [])) {
      if (!c.candidateId || importedIds.has(c.candidateId)) continue;
      if (validateStoredIndependentVerification(c) !== null) continue;
      if (!reviewDecisions.has(c.candidateId))
        reviewDecisions.set(c.candidateId, c.review?.decision ?? null);
    }
  }
  const pendingOnly = new Set();
  for (const data of scanFiles(candidateDir, key)) {
    for (const c of (data.candidates || [])) {
      if (!c.candidateId || importedIds.has(c.candidateId)) continue;
      if (validateStoredIndependentVerification(c) !== null) continue;
      if (reviewDecisions.has(c.candidateId)) continue;
      pendingOnly.add(c.candidateId);
    }
  }
  let count = 0;
  for (const [, dec] of reviewDecisions) if (dec === 'Keep') count++;
  count += pendingOnly.size;
  return count;
}

// ── Read import manifest ────────────────────────────────────────────────────
// Returns the raw manifest array, or [] if the manifest does not yet exist.
export function readManifestEntries(manifestPath = DEFAULT_IMPORT_MANIFEST) {
  if (!existsSync(manifestPath)) return [];
  try {
    const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── Reviewed-only MongoDB count ──────────────────────────────────────────────
// A MongoDB Question counts toward Pilot slot satisfaction ONLY if:
//   Its status is exactly 'expert_approved'. Manifest presence alone and the
//   legacy 'active' status are insufficient because neither proves the v2 gate.
//
// This intentionally excludes structurally_validated documents that are:
//   - smoke-test artefacts
//   - known-failure documents (e.g. B2G, B2I)
//   - historical QA fixtures
//   - any unreviewed manually-inserted question
export async function countReviewedInMongoDB(slot, _manifestPath = DEFAULT_IMPORT_MANIFEST) {
  return Question.countDocuments({
    section: slot.section, domain: slot.domain, skill: slot.skill,
    difficulty: slot.difficulty, type: slot.type,
    status: 'expert_approved',
  });
}

export async function computeNeeded(slot, candidateDir, reviewDir, manifestPath) {
  const inDb    = await countReviewedInMongoDB(slot, manifestPath);
  const pending = countPendingCandidates(slot, candidateDir, reviewDir, manifestPath);
  return { inDb, pending, needed: Math.max(0, TARGET_PER_SLOT - inDb - pending) };
}

export function writeCandidateFile(candidates, rejected, slot, generatorVersion, outputDir = DEFAULT_CANDIDATE_DIR) {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = makeSkillSlug(slot.skill);
  const filename = `math_${slug}_${slot.difficulty}_${slot.type}_${ts}.json`;
  const finalPath = join(outputDir, filename);
  const tmpPath   = finalPath + '.tmp';
  const payload = {
    generatorVersion,
    generatedAt: new Date().toISOString(),
    generatedByModel: MODEL,
    slot: { section: slot.section, domain: slot.domain, skill: slot.skill,
            difficulty: slot.difficulty, type: slot.type },
    candidates,
    rejected,
  };
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  renameSync(tmpPath, finalPath);
  return finalPath;
}

export async function generateSlot(client, slot, generatorVersion, candidateDir, manifestPath, requestCount = TARGET_PER_SLOT, pipeline = {}) {
  const label = slotKey(slot);
  console.log(`\n[generate] ${label}`);
  const ts = Date.now().toString();
  const t0 = Date.now();
  let message;
  try {
    message = await client.messages.create({
      model: MODEL, max_tokens: 16000,
      messages: [{ role: 'user', content: buildMathQuestionPrompt(slot, requestCount) }],
    });
  } catch (err) {
    console.error(`  [api_error] ${label}: ${err.message}`);
    return { candidates: 0, rejected: 0, error: err.message };
  }
  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  const usage = message.usage || {};
  console.log(`  stop_reason=${message.stop_reason} duration=${elapsed}s in=${usage.input_tokens||'?'} out=${usage.output_tokens||'?'}`);
  if (message.stop_reason === 'max_tokens') {
    console.warn('  [truncated] max_tokens');
    return { candidates: 0, rejected: 0, error: 'max_tokens' };
  }
  const raw = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let parsed;
  try { parsed = extractAndParseJSON(raw, slot); }
  catch (err) {
    saveDebugResponse(raw, slot, err);
    console.warn(`  [parse_fail] ${err.message}`);
    return { candidates: 0, rejected: 0, error: err.message };
  }
  if (parsed.length !== requestCount) {
    const msg = `[count_mismatch] expected=${requestCount} received=${parsed.length}`;
    console.warn(`  ${msg}`);
    return { candidates: 0, rejected: parsed.length, error: msg };
  }
  const passingCandidates = [], rejectedEntries = [];
  const solveBlind = pipeline.solveBlind || createAnthropicBlindSolver(client);
  const explainVerified = pipeline.explainVerified || createAnthropicVerifiedExplainer(client);
  const verifyExplanation = pipeline.verifyExplanation || createAnthropicExplanationVerifier(client);
  const checkBankDuplicate = pipeline.isDuplicate || isDuplicate;
  const seenGeneratedQuestions = [];
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    const cid = makeCandidateId(slot, ts, i);
    // The generator is deliberately forbidden from producing an explanation.
    // A temporary value is used only for the legacy structural shape check.
    if (Object.hasOwn(q, 'explanation')) {
      const msg = 'generator returned an explanation before independent verification';
      console.warn(`  [premature_explanation_reject] Q${i+1}: ${msg}`);
      rejectedEntries.push({ candidateId: cid, rejectGate: 'premature_explanation_reject', rejectReason: msg }); continue;
    }
    const structuralCandidate = { ...q, explanation: 'pending independent verification' };
    let structErr;
    try { validateQuestion(structuralCandidate, slot); } catch (err) { structErr = err.message; }
    if (structErr) { console.warn(`  [structural_reject] Q${i+1}: ${structErr}`); rejectedEntries.push({ candidateId: cid, rejectGate: 'structural_reject', rejectReason: structErr }); continue; }
    const setDuplicate = findSetLevelDuplicate(q.question, seenGeneratedQuestions);
    seenGeneratedQuestions.push(q.question);
    if (setDuplicate) {
      const msg = `duplicate within generated set (similarity=${setDuplicate.similarity.toFixed(2)})`;
      console.warn(`  [set_duplicate_reject] Q${i+1}: ${msg}`);
      rejectedEntries.push({ candidateId: cid, rejectGate: 'set_duplicate_reject', rejectReason: msg }); continue;
    }
    const artifact = containsGenerationArtifacts({ ...q, explanation: '' });
    if (artifact) { console.warn(`  [artifact_reject] Q${i+1}: "${artifact}"`); rejectedEntries.push({ candidateId: cid, rejectGate: 'artifact_reject', rejectReason: `matched "${artifact}"` }); continue; }
    // Gate 5: Type-specific answer format sanity
    // Grid-in: answer must be a valid numeric string (parseNumericAnswer)
    // MCQ: answer must be exactly one of A/B/C/D (trimmed)
    // This does NOT verify mathematical correctness — format only.
    if (slot.type === 'grid') {
      if (parseNumericAnswer(q.answer) === null) {
        const msg = `answer "${q.answer}" is not a valid numeric string`;
        console.warn(`  [numeric_reject] Q${i+1}: ${msg}`);
        rejectedEntries.push({ candidateId: cid, rejectGate: 'numeric_reject', rejectReason: msg }); continue;
      }
      if (q.options !== null && q.options !== undefined) {
        const msg = 'grid-in must have options=null';
        console.warn(`  [grid_reject] Q${i+1}: ${msg}`);
        rejectedEntries.push({ candidateId: cid, rejectGate: 'grid_reject', rejectReason: msg }); continue;
      }
    } else if (slot.type === 'mcq') {
      // MCQ normalization policy: trim whitespace before checking.
      // 'A ' -> 'A' -> passes. Other whitespace variants pass if they trim to A/B/C/D.
      const trimmedAnswer = typeof q.answer === 'string' ? q.answer.trim() : '';
      if (!['A','B','C','D'].includes(trimmedAnswer)) {
        const msg = `answer "${q.answer}" is not a valid MCQ answer (must be A, B, C, or D)`;
        console.warn(`  [mcq_answer_reject] Q${i+1}: ${msg}`);
        rejectedEntries.push({ candidateId: cid, rejectGate: 'mcq_answer_reject', rejectReason: msg }); continue;
      }
      if (!Array.isArray(q.options) || q.options.length === 0) {
        const msg = 'MCQ must have a non-empty options array';
        console.warn(`  [mcq_options_reject] Q${i+1}: ${msg}`);
        rejectedEntries.push({ candidateId: cid, rejectGate: 'mcq_options_reject', rejectReason: msg }); continue;
      }
    }
    const dup = await checkBankDuplicate(q.question);
    if (dup) { console.warn(`  [duplicate_reject] Q${i+1}`); rejectedEntries.push({ candidateId: cid, rejectGate: 'duplicate_reject', rejectReason: 'already exists' }); continue; }
    const candidateForValidation = {
      section: slot.section, domain: slot.domain, skill: slot.skill,
      difficulty: slot.difficulty, type: slot.type, question: q.question,
      options: slot.type === 'grid' ? null : q.options, answer: String(q.answer),
    };
    let independent;
    try { independent = await independentlyValidateMathCandidate(candidateForValidation, solveBlind); }
    catch (err) { independent = { valid: false, reason: `solver error: ${err.message}` }; }
    if (!independent.valid) {
      console.warn(`  [independent_solver_reject] Q${i+1}: ${independent.reason}`);
      rejectedEntries.push({
        candidateId: cid,
        rejectGate: 'independent_solver_reject',
        rejectReason: independent.reason,
        auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult),
      }); continue;
    }
    let explanation;
    try { explanation = await explainVerified({ candidate: candidateForValidation, solverResult: independent.solverResult }); }
    catch (err) {
      const msg = `verified explanation failed: ${err.message}`;
      console.warn(`  [explanation_reject] Q${i+1}: ${msg}`);
      rejectedEntries.push({ candidateId: cid, rejectGate: 'explanation_reject', rejectReason: msg,
        auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult) }); continue;
    }
    const explanationHash = hashMathExplanation(explanation);
    const explanationPolicyError = findExplanationPolicyViolation(candidateForValidation, explanation);
    if (explanationPolicyError) {
      rejectedEntries.push({ candidateId: cid, rejectGate: 'explanation_policy_reject',
        rejectReason: explanationPolicyError,
        auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult, explanation) }); continue;
    }
    let explanationVerification;
    try {
      explanationVerification = await verifyExplanation({
        candidate: candidateForValidation, solverResult: independent.solverResult, explanation, explanationHash,
      });
    } catch (err) {
      explanationVerification = { status: 'rejected', reason: `verifier error: ${err.message}` };
    }
    const explanationError = validateExplanationVerifierResult(
      candidateForValidation, explanation, explanationVerification
    );
    if (explanationError) {
      rejectedEntries.push({ candidateId: cid, rejectGate: 'explanation_verification_reject',
        rejectReason: explanationError,
        auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult, explanation) }); continue;
    }
    const finalCandidate = { ...candidateForValidation, explanation };
    const finalArtifact = containsGenerationArtifacts(finalCandidate);
    if (finalArtifact) { rejectedEntries.push({ candidateId: cid, rejectGate: 'artifact_reject', rejectReason: `matched "${finalArtifact}"`,
      auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult, explanation) }); continue; }
    const finalConsistency = checkExplicitAnswerConsistency(finalCandidate, slot);
    if (finalConsistency) { rejectedEntries.push({ candidateId: cid, rejectGate: 'consistency_reject', rejectReason: finalConsistency,
      auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult, explanation) }); continue; }
    const finalScopeViolation = findSatScopeViolation(explanation);
    if (finalScopeViolation) { rejectedEntries.push({ candidateId: cid, rejectGate: 'sat_scope_reject', rejectReason: finalScopeViolation,
      auditEvidence: buildIndependentRejectionEvidence(candidateForValidation, independent.solverResult, explanation) }); continue; }
    const frozen = freezeMathCandidate(candidateForValidation);
    passingCandidates.push({
      candidateId: cid, section: slot.section, domain: slot.domain, skill: slot.skill,
      difficulty: slot.difficulty, type: slot.type, question: q.question, options: slot.type === 'grid' ? null : (q.options ?? null),
      answer: String(q.answer), explanation,
      validation: { candidateHash: frozen.candidateHash, status: 'independently_verified',
        verifiedAt: new Date().toISOString(), solutionCount: independent.solverResult.solutionCount,
        conditionsConsistent: independent.solverResult.conditionsConsistent,
        domainMatch: independent.solverResult.domainMatch, skillMatch: independent.solverResult.skillMatch,
        difficultyRating: independent.solverResult.difficultyRating,
        difficultyMatch: independent.solverResult.difficultyMatch,
        languageUnambiguous: independent.solverResult.languageUnambiguous,
        solvedAnswer: String(independent.solverResult.answer),
        solverFormatRetries: independent.solverResult.formatRetries ?? 0,
        defensibleOptionCount: independent.solverResult.defensibleOptionCount ?? null,
        distractorsPlausible: independent.solverResult.distractorsPlausible ?? null,
        explanationStatus: 'independently_verified', explanationHash,
        explanationVerifiedAt: new Date().toISOString(),
        explanationPolicyCompliant: true,
        explanationReasoningCorrect: explanationVerification.reasoningCorrect,
        explanationAnswerConsistent: explanationVerification.answerConsistent,
        explanationNoAddedAssumptions: explanationVerification.noAddedAssumptions,
        explanationLanguageClear: explanationVerification.languageClear,
        explanationSatScopeCompliant: explanationVerification.satScopeCompliant },
      review: { decision: null, correctAnswer: null, uniqueAnswer: null, conditionsConsistent: null,
                explanationCorrect: null, skillTagCorrect: null, difficultyCorrect: null,
                reviewer: null, reviewerRole: null, expertAttestation: null, reviewedAt: null,
                reviewerNotes: null, reviewedContent: null },
    });
    console.log(`  [candidate] Q${i+1}: "${q.question.substring(0,65)}"`);
  }
  const filePath = writeCandidateFile(passingCandidates, rejectedEntries, slot, generatorVersion, candidateDir);
  console.log(`  [file] Written: ${filePath} (${passingCandidates.length} candidates, ${rejectedEntries.length} rejected)`);
  return { candidates: passingCandidates.length, rejected: rejectedEntries.length, filePath };
}

export async function main() {
  const args     = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const allSlots = args.includes('--all-math-slots');
  const slotIdx  = args.indexOf('--slot');
  let maxCandidates;
  try { maxCandidates = parseMaxCandidatesArg(args); }
  catch (err) { console.error(`[generateMathCandidates] ${err.message}`); process.exit(1); }
  const candidateDir  = process.env.MATH_CANDIDATE_OUTPUT_DIR || DEFAULT_CANDIDATE_DIR;
  const reviewDir     = process.env.MATH_REVIEW_DIR           || DEFAULT_REVIEW_DIR;
  const manifestPath  = process.env.MATH_IMPORT_MANIFEST      || DEFAULT_IMPORT_MANIFEST;
  let targetSlots = [];
  if (allSlots) {
    targetSlots = MATH_SLOTS;
  } else if (slotIdx !== -1 && args[slotIdx+1]) {
    try { targetSlots = [parseSlotArg(args[slotIdx+1])]; }
    catch (err) { console.error(`[generateMathCandidates] ${err.message}`); process.exit(1); }
  } else {
    console.error('[generateMathCandidates] Specify --slot <slot> or --all-math-slots');
    process.exit(1);
  }
  const generatorVersion = resolveGeneratorVersion();
  console.log('\n=== generateMathCandidates.mjs ==');
  console.log(`Generator version: ${generatorVersion}`);
  console.log(`Candidate dir:     ${candidateDir}`);
  console.log(`Review dir:        ${reviewDir}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Slots: ${targetSlots.length}`);
  console.log(`Max candidates per slot: ${maxCandidates ?? 'slot need'}`);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[generateMathCandidates] Connected\n');
  const plan = [];
  for (const slot of targetSlots) {
    const { inDb, pending, needed } = await computeNeeded(slot, candidateDir, reviewDir, manifestPath);
    plan.push({ slot, inDb, pending, needed });
  }
  if (isDryRun) {
    console.log('=== DRY RUN PLAN ===\n');
    for (const { slot, inDb, pending, needed } of plan) {
      console.log(`${needed===0?'[SKIP]  ':`[GENERATE]`} ${slotKey(slot)}`);
      console.log(`         MongoDB: ${inDb}  Pending: ${pending}  Needed: ${needed}`);
    }
    console.log(`\nSlots to generate: ${plan.filter(p=>p.needed>0).length} / ${plan.length}`);
    console.log('Dry run complete -- 0 API calls, 0 files written.');
    await mongoose.disconnect();
    return;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let totalCandidates=0, totalRejected=0, totalSkipped=0, totalErrors=0;
  for (const { slot, needed } of plan) {
    if (needed === 0) { console.log(`[skip] ${slotKey(slot)}`); totalSkipped++; continue; }
    const requestCount = maxCandidates === null ? needed : Math.min(needed, maxCandidates);
    const result = await generateSlot(client, slot, generatorVersion, candidateDir, manifestPath, requestCount);
    totalCandidates += result.candidates || 0;
    totalRejected   += result.rejected   || 0;
    if (result.error && !result.filePath) totalErrors++;
  }
  console.log('\n=== generateMathCandidates COMPLETE ==');
  console.log(`  candidates written: ${totalCandidates}`);
  console.log(`  rejected:           ${totalRejected}`);
  console.log(`  slots skipped:      ${totalSkipped}`);
  console.log(`  errors:             ${totalErrors}`);
  console.log('  MongoDB inserts:    0  (for human review only)');
  await mongoose.disconnect();
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch(err => { console.error('[generateMathCandidates] Fatal:', err.message); process.exit(1); });
}
