/**
 * backend/tests/importRWCandidates.test.mjs
 * ESM tests for importRWCandidates.mjs
 * 0 API calls. 0 real MongoDB writes.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IRC_PATH  = path.resolve(__dirname, '..', 'scripts', 'importRWCandidates.mjs');

let mod;
try { mod = await import(IRC_PATH); }
catch (err) { console.error(`FATAL: ${err.message}`); process.exit(1); }

const {
  validateBatchStructure, validateCandidateStructure, validateRWReviewSchema,
  validateSlotConsistency, preflightAllCandidates,
  readManifest, readImportedCandidateIds, appendToManifest,
  writeRejectionAudit, importReviewFile, main,
} = mod;

const src        = fs.readFileSync(IRC_PATH, 'utf8');
const nonComment = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

const SLOT = { section:'rw', domain:'Craft and Structure', skill:'Words in Context', difficulty:'easy', type:'mcq' };

function mkT() { return fs.mkdtempSync(path.join(os.tmpdir(), 'irc-test-')); }
function rm(...ds) { for (const d of ds) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true }); }
function wM(p, e) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(e)); }

function makePassage(n) { return Array(n).fill('word').join(' '); }

function makeCandidate(id, decision='Keep', overrides={}) {
  const bv = decision !== 'Reject';
  return {
    candidateId: id,
    section: 'rw', domain: 'Craft and Structure', skill: 'Words in Context',
    difficulty: 'easy', type: 'mcq',
    passage: makePassage(40),
    passageSource: 'Literature',
    question: `What does the word X mean in context? (${id})`,
    options: ['A. alpha','B. beta','C. gamma','D. delta'],
    answer: 'A',
    explanation: 'The context supports A.',
    review: {
      reviewVersion: 'rw-review-v1',
      decision,
      correctAnswer: bv, uniqueAnswer: bv,
      passageAppropriate: bv, passageSourceAccurate: bv,
      explanationCorrect: bv, skillTagCorrect: true, difficultyCorrect: true,
      reviewer: 'test-reviewer',
      reviewedAt: new Date().toISOString(),
      reviewerNotes: null, reviewedContent: null,
      ...(overrides.reviewFields || {}),
    },
    ...(overrides.candidateFields || {}),
  };
}

function makeBatch(dir, filename, candidates, slotOverride=null) {
  const payload = {
    generatorVersion: 'test-ver',
    promptVersion: 'rw-prompt-v1',
    generatedAt: new Date().toISOString(),
    generatedByModel: 'claude-sonnet-4-6',
    slot: slotOverride || { ...SLOT },
    candidates, rejected: [],
  };
  const fp = path.join(dir, filename);
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2));
  return fp;
}

let pass=0, fail=0;
function test(n,f){ try{f();console.log(`  [PASS] ${n}`);pass++;} catch(e){console.log(`  [FAIL] ${n} -> ${e.message}`);fail++;} }
async function testA(n,f){ try{await f();console.log(`  [PASS] ${n}`);pass++;} catch(e){console.log(`  [FAIL] ${n} -> ${e.message}`);fail++;} }

console.log('\n=== importRWCandidates.test.mjs ===\n');

// ── Import safety ─────────────────────────────────────────────
console.log('-- Import safety --');
test('Module imports without error', () => assert(mod !== undefined));
test('main is a function (guard works)', () => assert(typeof main === 'function'));
test('All helpers exported', () => {
  for (const fn of [validateBatchStructure, validateCandidateStructure, validateRWReviewSchema,
                    validateSlotConsistency, preflightAllCandidates, readManifest,
                    readImportedCandidateIds, appendToManifest, writeRejectionAudit,
                    importReviewFile, main])
    assert(typeof fn === 'function');
});
test('Exactly 1 Question.create call in non-comment code', () => {
  const calls = (nonComment.match(/Question\.create\s*\(/g)||[]).length;
  assert.strictEqual(calls, 1, `Expected 1, got ${calls}`);
});
test('isDirectExecution guard present', () => assert(src.includes('isDirectExecution') && src.includes('pathToFileURL')));
test('No parseNumericAnswer in non-comment', () => assert(!nonComment.includes('parseNumericAnswer')));
test('No checkExplicitAnswerConsistency in non-comment', () => assert(!nonComment.includes('checkExplicitAnswerConsistency')));
test('CORRECTNESS_FIELDS has passageAppropriate not conditionsConsistent', () => {
  assert(src.includes('passageAppropriate'), 'passageAppropriate missing');
  assert(src.includes('passageSourceAccurate'), 'passageSourceAccurate missing');
  const cfStart = src.indexOf('const CORRECTNESS_FIELDS');
  const cfEnd   = src.indexOf('];', cfStart);
  const cfBlock = src.slice(cfStart, cfEnd);
  assert(cfBlock.includes('passageAppropriate'), 'passageAppropriate must be in const CORRECTNESS_FIELDS');
  const hasCondsConst = cfBlock.indexOf('conditionsConsistent') >= 0;
  assert(hasCondsConst === false, 'conditionsConsistent must not be in const CORRECTNESS_FIELDS');
});
test('status=structurally_validated hardcoded', () => assert(src.includes('"structurally_validated"')));
test('passage in Question.create block', () => {
  const qcIdx = src.indexOf('doc = await Question.create');
  const qcBlock = src.slice(qcIdx, qcIdx+600);
  assert(qcBlock.includes('passage:'), 'passage missing from Question.create');
  assert(qcBlock.includes('passageSource:'), 'passageSource missing from Question.create');
});
test('promptVersion NOT in Question.create block', () => {
  const qcIdx = src.indexOf('doc = await Question.create');
  const qcEnd = src.indexOf('});', qcIdx);
  const qcBlock = src.slice(qcIdx, qcEnd);
  const nonCommentQC = qcBlock.split('\n').filter(l=>!l.trim().startsWith('//')).join('\n');
  assert(!nonCommentQC.includes('promptVersion'), 'promptVersion must not be in Question.create call');
});
test('MANIFEST WRITE FAILED warning present', () => assert(src.includes('MANIFEST WRITE FAILED')));
test('rejectStage in rejection log entries', () => assert(src.includes('rejectStage')));
test('preflightAllCandidates called in importReviewFile', () => assert(src.includes('preflightAllCandidates(candidates')));
test('conditionsConsistent rejection guard present', () => assert(src.includes('conditionsConsistent') && src.includes('must not appear')));

// ── validateBatchStructure ─────────────────────────────────────
console.log('\n-- validateBatchStructure --');
test('Valid RW batch passes', () => {
  assert.strictEqual(validateBatchStructure({
    generatorVersion:'v1', promptVersion:'rw-prompt-v1', generatedAt:'d',
    generatedByModel:'m', slot:{section:'rw'}, candidates:[]
  }), null);
});
test('Missing promptVersion fails', () => assert(validateBatchStructure({
  generatorVersion:'v1', generatedAt:'d', generatedByModel:'m', slot:{section:'rw'}, candidates:[]
}) !== null));
test('Wrong promptVersion fails', () => assert(validateBatchStructure({
  generatorVersion:'v1', promptVersion:'math-prompt-v1', generatedAt:'d',
  generatedByModel:'m', slot:{section:'rw'}, candidates:[]
}) !== null));
test('slot.section=math fails', () => assert(validateBatchStructure({
  generatorVersion:'v1', promptVersion:'rw-prompt-v1', generatedAt:'d',
  generatedByModel:'m', slot:{section:'math'}, candidates:[]
}) !== null));
test('Missing slot fails', () => assert(validateBatchStructure({
  generatorVersion:'v1', promptVersion:'rw-prompt-v1', generatedAt:'d',
  generatedByModel:'m', candidates:[]
}) !== null));
test('candidates not array fails', () => assert(validateBatchStructure({
  generatorVersion:'v1', promptVersion:'rw-prompt-v1', generatedAt:'d',
  generatedByModel:'m', slot:{section:'rw'}
}) !== null));

// ── validateCandidateStructure ────────────────────────────────
console.log('\n-- validateCandidateStructure --');
test('Valid candidate passes', () => assert.strictEqual(validateCandidateStructure(makeCandidate('c1'), SLOT, new Set()), null));
test('Missing candidateId fails', () => {
  const c = makeCandidate('c1'); delete c.candidateId;
  assert(validateCandidateStructure(c, SLOT, new Set()) !== null);
});
test('Duplicate candidateId fails', () => {
  assert(validateCandidateStructure(makeCandidate('c1'), SLOT, new Set(['c1'])) !== null);
});
test('Missing passage fails', () => {
  const c = makeCandidate('c1'); delete c.passage;
  assert(validateCandidateStructure(c, SLOT, new Set()) !== null);
});
test('Empty passage fails', () => {
  const c = makeCandidate('c1', 'Keep', {candidateFields:{passage:''}});
  assert(validateCandidateStructure(c, SLOT, new Set()) !== null);
});
test('Missing passageSource fails', () => {
  const c = makeCandidate('c1'); delete c.passageSource;
  assert(validateCandidateStructure(c, SLOT, new Set()) !== null);
});
test('Slot mismatch fails', () => {
  const c = makeCandidate('c1', 'Keep', {candidateFields:{difficulty:'hard'}});
  assert(validateCandidateStructure(c, SLOT, new Set()) !== null);
});

// ── validateRWReviewSchema ─────────────────────────────────────
console.log('\n-- validateRWReviewSchema --');
test('Valid Keep passes', () => assert.strictEqual(validateRWReviewSchema(makeCandidate('c1','Keep')), null));
test('Valid Reject passes', () => assert.strictEqual(validateRWReviewSchema(makeCandidate('c1','Reject')), null));
test('Valid Edit passes', () => {
  const c = makeCandidate('c1','Edit',{reviewFields:{reviewedContent:{
    passage:makePassage(35),passageSource:'Literature',
    question:'Q?',options:['A. a','B. b','C. c','D. d'],answer:'A',explanation:'E.'
  }}});
  assert.strictEqual(validateRWReviewSchema(c), null);
});
test('Missing reviewVersion fails', () => {
  const c = makeCandidate('c1','Keep',{reviewFields:{reviewVersion:undefined}});
  assert(validateRWReviewSchema(c) !== null);
});
test('Wrong reviewVersion fails', () => {
  const c = makeCandidate('c1','Keep',{reviewFields:{reviewVersion:'math-review-v1'}});
  assert(validateRWReviewSchema(c) !== null);
});
test('conditionsConsistent present fails (wrong schema)', () => {
  const c = makeCandidate('c1','Keep');
  c.review.conditionsConsistent = true;
  const err = validateRWReviewSchema(c);
  assert(err !== null && err.includes('conditionsConsistent'), `Got: ${err}`);
});
test('decision=null fails', () => assert(validateRWReviewSchema(makeCandidate('c1',null)) !== null));
test('Missing passageAppropriate fails', () => {
  const c = makeCandidate('c1','Keep'); delete c.review.passageAppropriate;
  assert(validateRWReviewSchema(c) !== null);
});
test('passageAppropriate=null fails (must be boolean)', () => {
  const c = makeCandidate('c1','Keep',{reviewFields:{passageAppropriate:null}});
  assert(validateRWReviewSchema(c) !== null);
});
test('Missing passageSourceAccurate fails', () => {
  const c = makeCandidate('c1','Keep'); delete c.review.passageSourceAccurate;
  assert(validateRWReviewSchema(c) !== null);
});
test('Missing reviewer fails', () => {
  const c = makeCandidate('c1','Keep',{reviewFields:{reviewer:''}});
  assert(validateRWReviewSchema(c) !== null);
});
test('Edit without reviewedContent fails', () => assert(validateRWReviewSchema(makeCandidate('c1','Edit')) !== null));
test('Edit missing passage in reviewedContent fails', () => {
  const c = makeCandidate('c1','Edit',{reviewFields:{reviewedContent:{
    passageSource:'Literature',question:'Q?',options:['A. a','B. b','C. c','D. d'],answer:'A',explanation:'E.'
  }}});
  assert(validateRWReviewSchema(c) !== null);
});
test('Edit missing passageSource in reviewedContent fails', () => {
  const c = makeCandidate('c1','Edit',{reviewFields:{reviewedContent:{
    passage:makePassage(35),question:'Q?',options:['A. a','B. b','C. c','D. d'],answer:'A',explanation:'E.'
  }}});
  assert(validateRWReviewSchema(c) !== null);
});

// ── Manifest ──────────────────────────────────────────────────
console.log('\n-- Manifest --');
test('readManifest returns [] for missing', () => { const r=readManifest('/tmp/no-irc.json'); assert(Array.isArray(r)&&r.length===0); });
test('readImportedCandidateIds empty for missing', () => { const ids=readImportedCandidateIds('/tmp/no-irc.json'); assert(ids instanceof Set&&ids.size===0); });
test('appendToManifest atomic write', () => {
  const d=mkT(), m=path.join(d,'m.json');
  appendToManifest({candidateId:'c1',questionId:'q1'},m);
  const data=JSON.parse(fs.readFileSync(m,'utf8'));
  assert(data.length===1&&data[0].candidateId==='c1');
  rm(d);
});
test('appendToManifest no .tmp left', () => {
  const d=mkT(), m=path.join(d,'m.json');
  appendToManifest({candidateId:'c1'},m);
  assert(!fs.existsSync(m+'.tmp'));
  rm(d);
});

// ── Rejection audit ────────────────────────────────────────────
console.log('\n-- Rejection audit --');
test('writeRejectionAudit writes valid JSON', () => {
  const d=mkT();
  const fp=writeRejectionAudit([{candidateId:'c1',rejectStage:'reviewer_reject',rejectReason:'test'}],'/tmp/r.json',d);
  const data=JSON.parse(fs.readFileSync(fp,'utf8'));
  assert(data.entries[0].rejectStage==='reviewer_reject');
  rm(d);
});
test('writeRejectionAudit no .tmp left', () => {
  const d=mkT(); writeRejectionAudit([],'r.json',d);
  assert.strictEqual(fs.readdirSync(d).filter(f=>f.endsWith('.tmp')).length,0);
  rm(d);
});
test('writeRejectionAudit creates dir', () => {
  const d=path.join(os.tmpdir(),`irc-rej-${Date.now()}`);
  writeRejectionAudit([],'r.json',d);
  assert(fs.existsSync(d)); rm(d);
});

// ── importReviewFile logic ─────────────────────────────────────
console.log('\n-- importReviewFile logic --');

await testA('Null decision refuses entire run', async () => {
  const d=mkT();
  const fp=makeBatch(d,'r.json',[makeCandidate('c1','Keep'),makeCandidate('c2',null)]);
  let threw=false;
  try { await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej')); }
  catch(err){ threw=true; assert(err.message.includes('c2'),`Expected c2: ${err.message}`); }
  assert(threw,'must throw');
  rm(d);
});

await testA('conditionsConsistent in review refuses entire run', async () => {
  const d=mkT();
  const c=makeCandidate('c1','Keep');
  c.review.conditionsConsistent=true;
  const fp=makeBatch(d,'r.json',[c]);
  let threw=false;
  try { await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej')); }
  catch(err){ threw=true; assert(err.message.includes('conditionsConsistent'),`Got: ${err.message}`); }
  assert(threw,'conditionsConsistent must refuse run');
  rm(d);
});

await testA('Wrong reviewVersion refuses entire run', async () => {
  const d=mkT();
  const c=makeCandidate('c1','Keep',{reviewFields:{reviewVersion:'rw-review-v0'}});
  const fp=makeBatch(d,'r.json',[c]);
  let threw=false;
  try { await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej')); }
  catch(err){ threw=true; }
  assert(threw,'wrong reviewVersion must refuse run');
  rm(d);
});

await testA('Wrong promptVersion in batch refuses run', async () => {
  const d=mkT();
  const fp=makeBatch(d,'r.json',[makeCandidate('c1','Keep')],{...SLOT,section:'rw'});
  const data=JSON.parse(fs.readFileSync(fp,'utf8'));
  data.promptVersion='math-prompt-v1';
  fs.writeFileSync(fp,JSON.stringify(data));
  let threw=false;
  try { await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej')); }
  catch(err){ threw=true; assert(err.message.includes('promptVersion'),`Got: ${err.message}`); }
  assert(threw);
  rm(d);
});

await testA('Empty candidates returns 0', async () => {
  const d=mkT();
  const fp=makeBatch(d,'r.json',[]);
  const r=await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej'));
  assert.strictEqual(r.inserted,0);
  rm(d);
});

await testA('Reject: reviewerRejected count + audit written', async () => {
  const d=mkT(), rejDir=path.join(d,'rej');
  const fp=makeBatch(d,'r.json',[makeCandidate('c1','Reject'),makeCandidate('c2','Reject')]);
  const r=await importReviewFile(fp,path.join(d,'m.json'),rejDir);
  assert.strictEqual(r.reviewerRejected,2);
  assert.strictEqual(r.inserted,0);
  const files=fs.readdirSync(rejDir).filter(f=>f.endsWith('.json'));
  assert(files.length>0,'audit must be written');
  const audit=JSON.parse(fs.readFileSync(path.join(rejDir,files[0]),'utf8'));
  assert(audit.entries.some(e=>e.rejectStage==='reviewer_reject'));
  rm(d);
});

await testA('candidateId in manifest is skipped', async () => {
  const d=mkT(), m=path.join(d,'m.json');
  wM(m,[{candidateId:'c1',questionId:'q-old'}]);
  const fp=makeBatch(d,'r.json',[makeCandidate('c1','Keep')]);
  const r=await importReviewFile(fp,m,path.join(d,'rej'));
  assert.strictEqual(r.skippedImported,1);
  assert.strictEqual(r.inserted,0);
  rm(d);
});

await testA('Summary counts accurate: reject + skip', async () => {
  const d=mkT(), m=path.join(d,'m.json');
  wM(m,[{candidateId:'c-skip'}]);
  const fp=makeBatch(d,'r.json',[makeCandidate('c-skip','Keep'),makeCandidate('c-rej','Reject')]);
  const r=await importReviewFile(fp,m,path.join(d,'rej'));
  assert.strictEqual(r.skippedImported,1);
  assert.strictEqual(r.reviewerRejected,1);
  assert.strictEqual(r.inserted,0);
  rm(d);
});

await testA('Dry-run: 0 manifest writes, 0 audit writes', async () => {
  const d=mkT(), m=path.join(d,'m.json'), rejDir=path.join(d,'rej');
  const fp=makeBatch(d,'r.json',[makeCandidate('c1','Reject')]);
  await importReviewFile(fp,m,rejDir,{dryRun:true});
  assert(!fs.existsSync(m),'no manifest in dry-run');
  assert(!fs.existsSync(rejDir)||fs.readdirSync(rejDir).length===0,'no audit in dry-run');
  rm(d);
});

// ── Source checks ──────────────────────────────────────────────
console.log('\n-- Source checks --');
test('passage_artifact gate present', () => assert(src.includes('passage_artifact')));
test('passage_source_invalid gate present', () => assert(src.includes('passage_source_invalid')));
test('VALID_PASSAGE_SOURCES has all 4 values', () => {
  for (const v of ['Literature','History/Social Studies','Science','Social Science'])
    assert(src.includes(`"${v}"`), `Missing: ${v}`);
});
test('Atomic manifest write (.tmp rename)', () => {
  const aIdx=src.indexOf('export function appendToManifest');
  const aEnd=src.indexOf('\nexport ',aIdx+1);
  const aBody=src.slice(aIdx,aEnd);
  assert(aBody.includes('renameSync') && aBody.includes('.tmp'));
});
test('Atomic audit write (.tmp rename)', () => {
  const wIdx=src.indexOf('export function writeRejectionAudit');
  const wEnd=src.indexOf('\nexport ',wIdx+1);
  const wBody=src.slice(wIdx,wEnd);
  assert(wBody.includes('renameSync') && wBody.includes('.tmp'));
});

// ── Regression ────────────────────────────────────────────────
console.log('\n-- Regression --');
const SB_PATH  = path.resolve(__dirname,'..','scripts','seedBank.js');
const IMC_PATH = path.resolve(__dirname,'..','scripts','importMathCandidates.mjs');
const sbSrc  = fs.readFileSync(SB_PATH,'utf8');
const imcSrc = fs.readFileSync(IMC_PATH,'utf8');
test('seedBank.js unchanged', () => assert(sbSrc.includes("section:'rw'") && sbSrc.includes('PILOT_SLOTS')));
test('importMathCandidates.mjs conditionsConsistent still present (Math schema unchanged)', () => {
  assert(imcSrc.includes('conditionsConsistent'), 'Math importer conditionsConsistent must remain');
});
test('importMathCandidates.mjs passageAppropriate absent (Math schema unchanged)', () => {
  assert(!imcSrc.includes('passageAppropriate'), 'passageAppropriate must not appear in Math importer');
});

console.log(`\n=== RESULTS: ${pass}/${pass+fail} passed ===`);
if (fail>0){ console.log(`${fail} failed.`); process.exit(1); }
else console.log('All tests pass -- 0 API calls, 0 real MongoDB writes.');
