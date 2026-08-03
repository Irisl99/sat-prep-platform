/**
 * backend/tests/generateRWCandidates.test.mjs
 * ESM tests for generateRWCandidates.mjs
 * 0 API calls. 0 real MongoDB writes. 0 candidate files committed.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RWG_PATH = path.resolve(__dirname, '..', 'scripts', 'generateRWCandidates.mjs');
const GMC_PATH = path.resolve(__dirname, '..', 'scripts', 'generateMathCandidates.mjs');
const SB_PATH  = path.resolve(__dirname, '..', 'scripts', 'seedBank.js');

let mod;
try { mod = await import(RWG_PATH); }
catch (err) { console.error(`FATAL: ${err.message}`); process.exit(1); }

const { validateRWCandidate, makeRWReviewBlock, generateRWSlot, main } = mod;

const src    = fs.readFileSync(RWG_PATH, 'utf8');
const sbSrc  = fs.readFileSync(SB_PATH,  'utf8');
const gmcSrc = fs.readFileSync(GMC_PATH, 'utf8');
const nonComment = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

function mkT() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rwg-test-')); }
function rm(...ds) { for (const d of ds) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true }); }

function makePassage(words) { return Array(words).fill('word').join(' '); }

function makeCandidate(overrides = {}) {
  return {
    passage:       overrides.passage       ?? makePassage(40),
    passageSource: overrides.passageSource ?? 'Literature',
    question:      overrides.question      ?? 'What does the word X most nearly mean?',
    options:       overrides.options       ?? ['A. alpha','B. beta','C. gamma','D. delta'],
    answer:        overrides.answer        ?? 'A',
    explanation:   overrides.explanation   ?? 'The context supports A.',
    ...overrides,
  };
}

let pass = 0, fail = 0;
function test(n, f) {
  try { f(); console.log(`  [PASS] ${n}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${n} -> ${e.message}`); fail++; }
}

console.log('\n=== generateRWCandidates.test.mjs ===\n');

// ── Import safety ─────────────────────────────────────────────
console.log('-- Import safety --');
test('Module imports without error', () => assert(mod !== undefined));
test('main is a function (guard works)', () => assert(typeof main === 'function'));
test('validateRWCandidate exported', () => assert(typeof validateRWCandidate === 'function'));
test('makeRWReviewBlock exported', () => assert(typeof makeRWReviewBlock === 'function'));
test('No Question.create in non-comment code', () => {
  const calls = (nonComment.match(/Question\.create\s*\(/g) || []).length;
  assert.strictEqual(calls, 0, `Found ${calls} calls`);
});
test('isDirectExecution guard present', () => assert(src.includes('isDirectExecution') && src.includes('pathToFileURL')));
test('Shared helpers imported from seedBank.js', () => {
  assert(src.includes("from './seedBank.js'"));
  assert(src.includes('buildPrompt') && src.includes('validateQuestion') && src.includes('isDuplicate'));
});
test('Shared helpers imported from generateMathCandidates.mjs', () => {
  assert(src.includes("from './generateMathCandidates.mjs'"));
  assert(src.includes('computeNeeded') && src.includes('writeCandidateFile') && src.includes('makeCandidateId'));
});
test('checkExplicitAnswerConsistency not called', () => assert(!nonComment.includes('checkExplicitAnswerConsistency')));
test('parseNumericAnswer not called', () => assert(!nonComment.includes('parseNumericAnswer')));

// ── Output contract ───────────────────────────────────────────
console.log('\n-- Output contract --');
test('PROMPT_VERSION is rw-prompt-v1', () => assert(src.includes("PROMPT_VERSION      = 'rw-prompt-v1'")));
test('REVIEW_VERSION is rw-review-v1', () => assert(src.includes("REVIEW_VERSION      = 'rw-review-v1'")));
test('makeRWReviewBlock returns correct structure', () => {
  const block = makeRWReviewBlock();
  assert.strictEqual(block.reviewVersion,         'rw-review-v1');
  assert.strictEqual(block.decision,              null);
  assert.strictEqual(block.correctAnswer,         null);
  assert.strictEqual(block.uniqueAnswer,          null);
  assert.strictEqual(block.passageAppropriate,    null);
  assert.strictEqual(block.passageSourceAccurate, null);
  assert.strictEqual(block.explanationCorrect,    null);
  assert.strictEqual(block.skillTagCorrect,       null);
  assert.strictEqual(block.difficultyCorrect,     null);
  assert.strictEqual(block.reviewer,              null);
  assert.strictEqual(block.reviewerNotes,         null);
  assert.strictEqual(block.reviewedAt,            null);
  assert.strictEqual(block.reviewedContent,       null);
});
test('conditionsConsistent absent from review block', () => {
  const block = makeRWReviewBlock();
  assert(!('conditionsConsistent' in block), 'conditionsConsistent must not appear in RW review block');
});
test('passageAppropriate is null in review block', () => assert.strictEqual(makeRWReviewBlock().passageAppropriate, null));
test('passageSourceAccurate is null in review block', () => assert.strictEqual(makeRWReviewBlock().passageSourceAccurate, null));
test('reviewVersion is first field in review block', () => {
  const block = makeRWReviewBlock();
  assert.strictEqual(Object.keys(block)[0], 'reviewVersion');
});

// ── RW local validation gates ─────────────────────────────────
console.log('\n-- RW local validation gates --');

test('Valid candidate passes all gates', () => assert.strictEqual(validateRWCandidate(makeCandidate()), null));

test('passage_missing: null passage rejected', () => {
  const r = validateRWCandidate(makeCandidate({ passage: null }));
  assert(r !== null && r.gate === 'passage_missing', `Got: ${JSON.stringify(r)}`);
});
test('passage_missing: empty string rejected', () => {
  const r = validateRWCandidate(makeCandidate({ passage: '' }));
  assert(r !== null && r.gate === 'passage_missing');
});
test('passage_missing: whitespace-only rejected', () => {
  const r = validateRWCandidate(makeCandidate({ passage: '   ' }));
  assert(r !== null && r.gate === 'passage_missing');
});

test('passage_length: 29 words rejected (below minimum)', () => {
  const r = validateRWCandidate(makeCandidate({ passage: makePassage(29) }));
  assert(r !== null && r.gate === 'passage_length', `Got: ${JSON.stringify(r)}`);
});
test('passage_length: 30 words accepted (lower boundary)', () => {
  assert.strictEqual(validateRWCandidate(makeCandidate({ passage: makePassage(30) })), null);
});
test('passage_length: 80 words accepted (upper boundary)', () => {
  assert.strictEqual(validateRWCandidate(makeCandidate({ passage: makePassage(80) })), null);
});
test('passage_length: 81 words rejected (above maximum)', () => {
  const r = validateRWCandidate(makeCandidate({ passage: makePassage(81) }));
  assert(r !== null && r.gate === 'passage_length', `Got: ${JSON.stringify(r)}`);
});

test('passage_source_invalid: unknown value rejected', () => {
  const r = validateRWCandidate(makeCandidate({ passageSource: 'Fiction' }));
  assert(r !== null && r.gate === 'passage_source_invalid');
});
test('passage_source_invalid: empty string rejected', () => {
  const r = validateRWCandidate(makeCandidate({ passageSource: '' }));
  assert(r !== null && r.gate === 'passage_source_invalid');
});
test('passage_source_invalid: all four canonical values accepted', () => {
  for (const src of ['Literature','History/Social Studies','Science','Social Science']) {
    const r = validateRWCandidate(makeCandidate({ passageSource: src }));
    assert.strictEqual(r, null, `Expected null for passageSource='${src}', got ${JSON.stringify(r)}`);
  }
});

test('passage_artifact: artifact in passage rejected', () => {
  const r = validateRWCandidate(makeCandidate({ passage: makePassage(35) + ' Wait — let me rewrite this.' }));
  assert(r !== null && r.gate === 'passage_artifact', `Got: ${JSON.stringify(r)}`);
});

test('mcq_answer_reject: numeric answer rejected', () => {
  const r = validateRWCandidate(makeCandidate({ answer: '7' }));
  assert(r !== null && r.gate === 'mcq_answer_reject');
});
test('mcq_answer_reject: E rejected', () => {
  const r = validateRWCandidate(makeCandidate({ answer: 'E' }));
  assert(r !== null && r.gate === 'mcq_answer_reject');
});
test('mcq_answer_reject: A B C D all accepted', () => {
  for (const ans of ['A','B','C','D']) {
    const r = validateRWCandidate(makeCandidate({ answer: ans }));
    assert.strictEqual(r, null, `Expected null for answer='${ans}'`);
  }
});
test('mcq_answer_reject: whitespace trimmed ("A " accepted)', () => {
  assert.strictEqual(validateRWCandidate(makeCandidate({ answer: 'A ' })), null);
});

test('mcq_options_missing: null options rejected', () => {
  const r = validateRWCandidate(makeCandidate({ options: null }));
  assert(r !== null && r.gate === 'mcq_options_missing');
});
test('mcq_options_missing: 3 options rejected', () => {
  const r = validateRWCandidate(makeCandidate({ options: ['A. a','B. b','C. c'] }));
  assert(r !== null && r.gate === 'mcq_options_missing');
});
test('mcq_options_missing: options missing label rejected', () => {
  const r = validateRWCandidate(makeCandidate({ options: ['alpha','B. beta','C. gamma','D. delta'] }));
  assert(r !== null && r.gate === 'mcq_options_missing');
});
test('mcq_options_missing: four labeled options accepted', () => {
  assert.strictEqual(validateRWCandidate(makeCandidate({
    options: ['A. first','B. second','C. third','D. fourth']
  })), null);
});

// ── Acceptance rate formatting ────────────────────────────────
console.log('\n-- Acceptance rate --');
test('Acceptance rate present in source', () => assert(src.includes('acceptance rate')));
test('Acceptance rate uses toFixed(1)', () => assert(src.includes('toFixed(1)')));
test('Acceptance rate omitted when denominator is 0', () => assert(src.includes('acceptanceRate !== null')));

// ── Dry-run behavior ──────────────────────────────────────────
console.log('\n-- Dry-run --');
test('--dry-run flag handled in source', () => assert(src.includes('dry-run') && src.includes('dryRun')));
test('Dry-run: 0 API calls (no client.messages call in dry path)', () => {
  const drySection = src.slice(src.indexOf('if (dryRun)'), src.indexOf('const client =') + 200);
  assert(!drySection.includes('client.messages'), 'dry-run must not call client.messages');
});
test('Dry-run: client is null in dry-run', () => assert(src.includes('dryRun ? null : new Anthropic()')));

// ── Slot satisfaction ─────────────────────────────────────────
console.log('\n-- Slot satisfaction --');
test('computeNeeded imported from generateMathCandidates.mjs', () => {
  assert(src.includes("from './generateMathCandidates.mjs'") && src.includes('computeNeeded'));
});
test('needed === 0 causes skip', () => assert(src.includes('needed === 0')));

// ── Regression: unchanged files ───────────────────────────────
console.log('\n-- Regression: unchanged files --');
test('seedBank.js unchanged: PILOT_SLOTS still has 26 RW slots', () => {
  const blockMatch = sbSrc.match(/PILOT_SLOTS\s*=\s*\[([\s\S]*?)\];/);
  assert(blockMatch, 'PILOT_SLOTS not found');
  const rwCount = (blockMatch[1].match(/section:'rw'/g) || []).length;
  assert.strictEqual(rwCount, 26, `Expected 26, got ${rwCount}`);
});
test('seedBank.js unchanged: buildPrompt still has RW branch', () => {
  assert(sbSrc.includes("slot.section === 'rw'"));
});
test('generateMathCandidates.mjs unchanged: no RW-specific gates', () => {
  assert(!gmcSrc.includes('passage_missing') && !gmcSrc.includes('passage_artifact'));
});
test('generateMathCandidates.mjs unchanged: Question.create still absent', () => {
  const nc = gmcSrc.split('\n').filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//')).join('\n');
  assert.strictEqual((nc.match(/Question\.create\s*\(/g)||[]).length, 0);
});

console.log(`\n=== RESULTS: ${pass}/${pass+fail} passed ===`);
if (fail > 0) { console.log(`${fail} failed.`); process.exit(1); }
else console.log('All tests pass -- 0 API calls, 0 MongoDB writes, 0 Question.create().');
