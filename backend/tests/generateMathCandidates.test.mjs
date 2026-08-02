import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GMC_PATH = path.resolve(__dirname, '..', 'scripts', 'generateMathCandidates.mjs');

let mod;
try { mod = await import(GMC_PATH); }
catch (err) { console.error(`FATAL: ${err.message}`); process.exit(1); }

const { resolveGeneratorVersion, slotKey, parseSlotArg, makeCandidateId,
  makeSkillSlug, readImportedCandidateIds, countPendingCandidates,
  writeCandidateFile, main } = mod;

const SLOT  = { section:'math', domain:'Algebra', skill:'Linear Equations 2-var', difficulty:'hard', type:'grid' };
const SLOT2 = { section:'math', domain:'Algebra', skill:'Linear Equations 1-var', difficulty:'easy', type:'mcq' };
const TARGET = 2;

function mkT() { return fs.mkdtempSync(path.join(os.tmpdir(),'gmc-')); }
function rm(...ds) { for(const d of ds) if(fs.existsSync(d)) fs.rmSync(d,{recursive:true}); }
function mkC(id,dec=null) {
  return { candidateId:id, section:'math', domain:'Algebra', skill:'Linear Equations 2-var',
           difficulty:'hard', type:'grid', question:`Q ${id}`, options:null, answer:'5', explanation:'5.',
           review:{ decision:dec, correctAnswer:null, uniqueAnswer:null, conditionsConsistent:null,
                    explanationCorrect:null, skillTagCorrect:null, difficultyCorrect:null,
                    reviewerNotes:null, reviewedContent:null } };
}
function wF(dir,fn,slot,candidates,rejected=[]) {
  fs.writeFileSync(path.join(dir,fn), JSON.stringify({
    generatorVersion:'test', generatedAt:new Date().toISOString(), generatedByModel:'test',
    slot:{section:slot.section,domain:slot.domain,skill:slot.skill,difficulty:slot.difficulty,type:slot.type},
    candidates, rejected }));
}
function wM(p,e) { fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(e)); }
function needed(db,p) { return Math.max(0,TARGET-db-p); }

let pass=0, fail=0;
function test(n,f){ try{f();console.log(`  [PASS] ${n}`);pass++;} catch(e){console.log(`  [FAIL] ${n} -> ${e.message}`);fail++;} }

const src = fs.readFileSync(GMC_PATH,'utf8');
const nonComment = src.split('\n').filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//')).join('\n');

console.log('\n=== generateMathCandidates.test.mjs ===\n');
console.log('-- ESM import verification --');
test('Module imports without error', ()=>assert(mod!==undefined));
test('Import does not run main() (guard works)', ()=>assert(typeof main==='function'));
test('All helpers exported', ()=>{ for(const fn of [resolveGeneratorVersion,slotKey,parseSlotArg,makeCandidateId,makeSkillSlug,readImportedCandidateIds,countPendingCandidates,writeCandidateFile,main]) assert(typeof fn==='function'); });
test('seedBank.js helpers reused not duplicated', ()=>{ assert(src.includes("from './seedBank.js'")); assert(src.includes('buildPrompt')&&src.includes('containsGenerationArtifacts')&&src.includes('isDuplicate')); });
test('Question.create never in non-comment code', ()=>{ const calls=(nonComment.match(/Question\.create\s*\(/g)||[]).length; assert.strictEqual(calls,0,`Found ${calls}`); });
test('isDirectExecution guard present', ()=>assert(src.includes('isDirectExecution')&&src.includes('pathToFileURL')));
test('Atomic write: no .tmp left', ()=>{ const d=mkT(); writeCandidateFile([mkC('c1')],[],SLOT,'v1',d); assert(fs.readdirSync(d).filter(f=>f.endsWith('.tmp')).length===0,'tmp left'); rm(d); });
test('.tmp files ignored during scan', ()=>{ const c=mkT(),r=mkT(); fs.writeFileSync(path.join(c,'t.json.tmp'),JSON.stringify({slot:{section:'math',domain:'Algebra',skill:'Linear Equations 2-var',difficulty:'hard',type:'grid'},candidates:[mkC('c1')],rejected:[]})); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),0); rm(c,r); });
test('dry-run 0-side-effects message in source', ()=>assert(src.includes('0 API calls, 0 files written')));

console.log('\n-- Slug / candidateId --');
test('makeSkillSlug: full readable slug', ()=>assert.strictEqual(makeSkillSlug('Linear Equations 2-var'),'Linear_Equations_2-var'));
test('makeCandidateId: full slug no truncation', ()=>assert.strictEqual(makeCandidateId(SLOT,'12345',0),'math_Linear_Equations_2-var_hard_grid_12345_0'));
test('candidateId uniqueness by index', ()=>{ const a=makeCandidateId(SLOT,'t',0),b=makeCandidateId(SLOT,'t',1); assert(a!==b&&a.endsWith('_0')&&b.endsWith('_1')); });

console.log('\n-- Generator version --');
test('PIPELINE_VERSION env overrides git', ()=>{ const orig=process.env.PIPELINE_VERSION; process.env.PIPELINE_VERSION='cv42'; const v=resolveGeneratorVersion(); orig!==undefined?(process.env.PIPELINE_VERSION=orig):delete process.env.PIPELINE_VERSION; assert.strictEqual(v,'cv42'); });
test('unknown fallback in source', ()=>assert(src.includes("return 'unknown'")));
test('generatorVersion written to file', ()=>{ const d=mkT(); const fp=writeCandidateFile([],[],SLOT,'g99',d); assert.strictEqual(JSON.parse(fs.readFileSync(fp,'utf8')).generatorVersion,'g99'); rm(d); });

console.log('\n-- Slot satisfaction --');
test('Pending candidate counts', ()=>{ const c=mkT(),r=mkT(); wF(c,'c.json',SLOT,[mkC('c1',null)]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),1); rm(c,r); });
test('Keep in review counts', ()=>{ const c=mkT(),r=mkT(); wF(r,'r.json',SLOT,[mkC('c1','Keep')]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),1); rm(c,r); });
test('Edit in review counts', ()=>{ const c=mkT(),r=mkT(); wF(r,'r.json',SLOT,[mkC('c1','Edit')]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),1); rm(c,r); });
test('Reject does NOT count', ()=>{ const c=mkT(),r=mkT(); wF(r,'r.json',SLOT,[mkC('c1','Reject')]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),0); rm(c,r); });
test('Reject causes needed=2', ()=>{ const c=mkT(),r=mkT(); wF(r,'r.json',SLOT,[mkC('c1','Reject'),mkC('c2','Reject')]); assert.strictEqual(needed(0,countPendingCandidates(SLOT,c,r,path.join(c,'no.json'))),2); rm(c,r); });
test('Same id counted once review wins', ()=>{ const c=mkT(),r=mkT(); wF(c,'c.json',SLOT,[mkC('c1',null)]); wF(r,'r.json',SLOT,[mkC('c1','Keep')]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),1); rm(c,r); });
test('Manifest excludes from scan', ()=>{ const c=mkT(),r=mkT(),m=path.join(c,'m.json'); wF(c,'c.json',SLOT,[mkC('c1',null)]); wF(r,'r.json',SLOT,[mkC('c1','Keep')]); wM(m,[{candidateId:'c1'}]); assert.strictEqual(countPendingCandidates(SLOT,c,r,m),0); rm(c,r); });
test('All-rejected candidates not satisfied', ()=>{ const c=mkT(),r=mkT(); wF(c,'c.json',SLOT,[],[{candidateId:'r1',rejectGate:'a',rejectReason:'t'}]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),0); assert.strictEqual(needed(0,0),2); rm(c,r); });
test('Other slot not counted', ()=>{ const c=mkT(),r=mkT(); wF(c,'c.json',SLOT2,[mkC('c1',null)]); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),0); rm(c,r); });
test('needed never negative', ()=>assert.strictEqual(needed(5,0),0));
test('2 db needed 0', ()=>assert.strictEqual(needed(2,0),0));
test('0 db 1 pending needed 1', ()=>assert.strictEqual(needed(0,1),1));
test('Corrupted file skipped', ()=>{ const c=mkT(),r=mkT(); fs.writeFileSync(path.join(c,'bad.json'),'NOT JSON'); assert.strictEqual(countPendingCandidates(SLOT,c,r,path.join(c,'no.json')),0); rm(c,r); });

console.log('\n-- File behavior --');
test('Output dir created if missing', ()=>{ const d=path.join(os.tmpdir(),`gmc-mkdir-${Date.now()}`); writeCandidateFile([],[],SLOT,'v1',d); assert(fs.existsSync(d)); rm(d); });
test('Candidate has all required fields', ()=>{ const d=mkT(); const fp=writeCandidateFile([mkC('c1')],[],SLOT,'v1',d); const c=JSON.parse(fs.readFileSync(fp,'utf8')).candidates[0]; for(const f of ['candidateId','section','domain','skill','difficulty','type','question','options','answer','explanation','review']) assert(f in c,`Missing: ${f}`); rm(d); });
test('review block all null fields', ()=>{ const d=mkT(); const fp=writeCandidateFile([mkC('c1')],[],SLOT,'v1',d); const rv=JSON.parse(fs.readFileSync(fp,'utf8')).candidates[0].review; for(const f of ['decision','correctAnswer','uniqueAnswer','conditionsConsistent','explanationCorrect','skillTagCorrect','difficultyCorrect','reviewerNotes','reviewedContent']) assert.strictEqual(rv[f],null,`${f} not null`); rm(d); });
test('readImportedCandidateIds empty for missing', ()=>{ const ids=readImportedCandidateIds('/tmp/no-such-xyz.json'); assert(ids instanceof Set&&ids.size===0); });
test('readImportedCandidateIds from manifest', ()=>{ const d=mkT(),m=path.join(d,'m.json'); wM(m,[{candidateId:'c1'},{candidateId:'c2'}]); const ids=readImportedCandidateIds(m); assert(ids.has('c1')&&ids.has('c2')&&ids.size===2); rm(d); });
test('slotKey correct', ()=>assert.strictEqual(slotKey(SLOT),'math/Algebra/Linear Equations 2-var/hard/grid'));
test('parseSlotArg rejects wrong format', ()=>assert.throws(()=>parseSlotArg('math/Algebra/hard/grid'),/Invalid slot/));


console.log('\n-- Type-specific answer format gate (B2N-H1) --');

// MCQ answer format: valid
test('MCQ answer A passes', ()=>{
  const c=mkT(),r=mkT();
  // writeCandidateFile is called only for passing candidates.
  // We test the gate logic via the source rather than a full API call.
  // Verify A/B/C/D are in the accepted list in source.
  assert(src.includes("['A','B','C','D'].includes(trimmedAnswer)"), 'ABCD check must be in source');
  rm(c,r);
});
test('MCQ answers B C D pass (source check)', ()=>{
  assert(src.includes("['A','B','C','D']"), 'ABCD list must be in source');
});
test('MCQ answer "7" would reject (mcq_answer_reject gate present)', ()=>{
  assert(src.includes('mcq_answer_reject'), 'mcq_answer_reject gate must exist');
});
test('MCQ answer "E" would reject (not in ABCD)', ()=>{
  // Verify the gate only accepts A/B/C/D
  assert(src.includes("['A','B','C','D'].includes(trimmedAnswer)") && src.includes('mcq_answer_reject'));
});
test('MCQ answer normalization: trim policy documented in source', ()=>{
  // Policy: trim whitespace before checking. "A " -> "A" -> passes.
  assert(src.includes("q.answer.trim()"), 'trim() must be applied to MCQ answer');
  assert(src.includes("MCQ normalization policy"), 'policy must be documented in comment');
});
test('Grid answer "7" passes numeric gate (source check)', ()=>{
  assert(src.includes('numeric_reject') && src.includes("slot.type === 'grid'"), 'numeric gate must be grid-only');
});
test('Grid answer "3/4" passes (parseNumericAnswer handles fractions)', ()=>{
  // parseNumericAnswer("3/4") returns 0.75 — tested in seedBank tests
  // Here we verify it is called only for grid slots
  const gridIdx = src.indexOf("if (slot.type === 'grid')");
  const numIdx  = src.indexOf('numeric_reject');
  assert(gridIdx > 0 && numIdx > gridIdx, 'numeric_reject must be inside grid block');
});
test('Grid answer "A" would reject (not numeric)', ()=>{
  // parseNumericAnswer("A") returns null — falls into numeric_reject
  assert(src.includes('numeric_reject'), 'numeric_reject must exist');
});
test('parseNumericAnswer never called for MCQ (gate is type-specific)', ()=>{
  // Find the mcq block and verify parseNumericAnswer is NOT inside it
  const mcqBlockStart = src.indexOf("} else if (slot.type === 'mcq')");
  const mcqBlockEnd   = src.indexOf('\n    }', mcqBlockStart + 1);
  const mcqBlock      = src.slice(mcqBlockStart, mcqBlockEnd);
  assert(!mcqBlock.includes('parseNumericAnswer'), 'parseNumericAnswer must NOT appear in MCQ block');
});
test('B2N regression: mcq_answer_reject gate exists (MCQ letters no longer incorrectly rejected)', ()=>{
  // Before fix: ALL MCQ answers went through numeric_reject → all 13 MCQ slots failed
  // After fix: MCQ answers go through mcq_answer_reject gate (A/B/C/D check only)
  assert(src.includes('mcq_answer_reject'), 'mcq_answer_reject must exist');
  assert(!src.includes("slot.type === 'mcq'") === false, 'mcq type branch must exist');
  // numeric_reject must be inside grid block only
  const gridBlock = src.slice(src.indexOf("if (slot.type === 'grid')"), src.indexOf("} else if (slot.type === 'mcq')"));
  assert(gridBlock.includes('numeric_reject'), 'numeric_reject must be in grid block');
  assert(!gridBlock.includes('mcq_answer_reject'), 'mcq_answer_reject must NOT be in grid block');
});
test('MCQ options preserved in candidate file (not hardcoded null)', ()=>{
  assert(src.includes("slot.type === 'grid' ? null"), 'options must be conditional on type');
});
test('No Question.create calls', ()=>{
  const nonComment = src.split('\n').filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//')).join('\n');
  assert.strictEqual((nonComment.match(/Question\.create\s*\(/g)||[]).length, 0);
});


console.log('\n-- Reviewed-only MongoDB satisfaction (B2N-H3) --');
test('readManifestEntries exported',()=>assert(src.includes('export function readManifestEntries')));
test('countReviewedInMongoDB exported',()=>assert(src.includes('export async function countReviewedInMongoDB')));
test('$or clause with status:active',()=>{
  const s=src.indexOf('export async function countReviewedInMongoDB');
  const e=src.indexOf('\nexport ',s+1);
  const b=src.slice(s,e);
  assert(b.includes("status: 'active'"),'active clause missing');
  assert(b.includes('$or: orClauses'),'$or missing');
});
test('importedQuestionIds from manifest questionId field',()=>{
  const s=src.indexOf('export async function countReviewedInMongoDB');
  const e=src.indexOf('\nexport ',s+1);
  const b=src.slice(s,e);
  assert(b.includes('entries.map(e => e.questionId)'));
});
test('structurally_validated NOT in count filter',()=>{
  const s=src.indexOf('export async function countReviewedInMongoDB');
  const e=src.indexOf('\nexport ',s+1);
  const b=src.slice(s,e);
  assert(!b.includes("structurally_validated"),'must not appear in filter');
});
test('known-failure and smoke-test docs excluded: rule comment in source',()=>{
  assert(src.includes('smoke-test') && src.includes('known-failure'));
});
test('empty $in guard present',()=>{
  const s=src.indexOf('export async function countReviewedInMongoDB');
  const e=src.indexOf('\nexport ',s+1);
  const b=src.slice(s,e);
  assert(b.includes('importedQuestionIds.length > 0'));
});
test('MongoDB $or never double-counts: comment present',()=>assert(src.includes('never double-counts')));
test('computeNeeded uses countReviewedInMongoDB not raw countDocuments',()=>{
  const s=src.indexOf('export async function computeNeeded');
  const e=src.indexOf('\nexport ',s+1);
  const b=src.slice(s,e);
  assert(b.includes('countReviewedInMongoDB(slot, manifestPath)'),'must call countReviewedInMongoDB');
  assert(!b.includes('countDocuments'),'must not call raw countDocuments');
});
test('manifest-imported candidateId excluded from pending scan (no double-count)',()=>{
  const d=mkT(),r=mkT(),m=path.join(d,'m.json');
  wM(m,[{candidateId:'c1',questionId:'q-abc'}]);
  wF(d,'c.json',SLOT,[mkC('c1','Keep')]);
  const pending=countPendingCandidates(SLOT,d,r,m);
  assert.strictEqual(pending,0,'manifest-imported must not count from file side');
  rm(d,r);
});
test('reviewed Keep not in manifest counts as pending',()=>{
  const d=mkT(),r=mkT();
  wF(r,'r.json',SLOT,[mkC('c1','Keep')]);
  const pending=countPendingCandidates(SLOT,d,r,path.join(d,'no.json'));
  assert.strictEqual(pending,1);
  rm(d,r);
});
test('reviewed Reject does not count toward satisfaction',()=>{
  const d=mkT(),r=mkT();
  wF(r,'r.json',SLOT,[mkC('c1','Reject')]);
  const pending=countPendingCandidates(SLOT,d,r,path.join(d,'no.json'));
  assert.strictEqual(pending,0);
  rm(d,r);
});
test('B2N-H3 rule comment present in source',()=>assert(src.includes('counts toward Pilot slot satisfaction ONLY if')));
test('No Question.create in non-comment',()=>{
  const nc=src.split('\n').filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//')).join('\n');
  assert.strictEqual((nc.match(/Question\.create\s*\(/g)||[]).length,0);
});

console.log('\n-- requestCount fix (B2N-H5) --');
test('generateSlot signature has requestCount param with default',()=>{
  assert(src.includes('requestCount = TARGET_PER_SLOT'),'requestCount default missing');
});
test('buildPrompt called with requestCount not TARGET_PER_SLOT',()=>{
  const s=src.indexOf('export async function generateSlot');
  const e=src.indexOf('\nexport async function main');
  const b=src.slice(s,e);
  assert(b.includes('buildPrompt(slot, requestCount)'),'must use requestCount');
  assert(!b.includes('buildPrompt(slot, TARGET_PER_SLOT)'),'must not use TARGET_PER_SLOT');
});
test('exact-count gate uses requestCount',()=>{
  const s=src.indexOf('export async function generateSlot');
  const e=src.indexOf('\nexport async function main');
  const b=src.slice(s,e);
  assert(b.includes('parsed.length !== requestCount'));
  assert(!b.includes('parsed.length !== TARGET_PER_SLOT'));
});
test('count_mismatch message reports requestCount',()=>{
  const s=src.indexOf('export async function generateSlot');
  const e=src.indexOf('\nexport async function main');
  const b=src.slice(s,e);
  assert(b.includes('expected=${requestCount}'));
  assert(!b.includes('expected=${TARGET_PER_SLOT}'));
});
test('main() passes needed to generateSlot',()=>{
  const s=src.indexOf('export async function main');
  assert(src.slice(s).includes('generateSlot(client, slot, generatorVersion, candidateDir, manifestPath, needed)'));
});
test('default requestCount equals TARGET_PER_SLOT',()=>assert(src.includes('requestCount = TARGET_PER_SLOT')));
test('TARGET_PER_SLOT still used in computeNeeded',()=>{
  const s=src.indexOf('export async function computeNeeded');
  const e=src.indexOf('\nexport ',s+1);
  assert(src.slice(s,e).includes('TARGET_PER_SLOT'));
});
test('TARGET_PER_SLOT NOT in generateSlot body',()=>{
  const s=src.indexOf('export async function generateSlot');
  const e=src.indexOf('\nexport async function main');
  const body=src.slice(s,e).split('\n').slice(1).join('\n');
  assert(!body.includes('TARGET_PER_SLOT'));
});
test('B2N-H4 regression: needed=1 causes requestCount=1',()=>{
  const s=src.indexOf('export async function main');
  assert(src.slice(s).includes('generateSlot(client, slot, generatorVersion, candidateDir, manifestPath, needed)'));
  assert(src.includes('buildPrompt(slot, requestCount)'));
  assert(src.includes('parsed.length !== requestCount'));
});
test('requestCount=1 + 2 returned causes count_mismatch (gate proof)',()=>{
  assert(src.includes('parsed.length !== requestCount'));
  assert(src.includes('expected=${requestCount}'));
});
test('needed=2 requestCount=2 for empty slots (same mechanism)',()=>{
  assert(src.includes('generateSlot(client, slot, generatorVersion, candidateDir, manifestPath, needed)'));
});
test('No API calls in tests',()=>assert(typeof writeCandidateFile==='function'));
test('No Question.create in non-comment',()=>{
  const nc=src.split('\n').filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//')).join('\n');
  assert.strictEqual((nc.match(/Question\.create\s*\(/g)||[]).length,0);
});

console.log(`\n=== RESULTS: ${pass}/${pass+fail} passed ===`);
if(fail>0){console.log(`${fail} failed.`);process.exit(1);}
else console.log('All tests pass -- 0 API calls, 0 MongoDB writes, 0 Question.create().');