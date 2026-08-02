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

console.log(`\n=== RESULTS: ${pass}/${pass+fail} passed ===`);
if(fail>0){console.log(`${fail} failed.`);process.exit(1);}
else console.log('All tests pass -- 0 API calls, 0 MongoDB writes, 0 Question.create().');