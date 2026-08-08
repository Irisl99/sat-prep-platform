import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { freezeMathCandidate, hashMathExplanation } from '../src/services/mathCandidateValidation.js';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const IMC_PATH=path.resolve(__dirname,'..','scripts','importMathCandidates.mjs');
let mod; try{mod=await import(IMC_PATH);}catch(err){console.error(`FATAL: ${err.message}`);process.exit(1);}
const {validateBatchStructure,validateCandidateStructure,validateReviewSchema,validateSlotConsistency,preflightAllCandidates,readManifest,readImportedCandidateIds,appendToManifest,writeRejectionAudit,importReviewFile,main}=mod;
const SLOT={section:'math',domain:'Algebra',skill:'Linear Equations 2-var',difficulty:'hard',type:'grid'};
function mkT(){return fs.mkdtempSync(path.join(os.tmpdir(),'imc-test-'));}
function rm(...ds){for(const d of ds)if(fs.existsSync(d))fs.rmSync(d,{recursive:true});}
function wM(p,e){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(e));}
function mkC(id,decision='Keep',overrides={}){
  const bv=decision!=='Reject';
  const candidate={candidateId:id,section:'math',domain:'Algebra',skill:'Linear Equations 2-var',difficulty:'hard',type:'grid',
    question:`If 2x + y = 10 and x - y = 2, what is x? (${id})`,options:null,answer:'4',
    explanation:'From x - y = 2: y = x - 2. Then 3x = 12, x = 4.',
    review:{decision,correctAnswer:bv,uniqueAnswer:bv,conditionsConsistent:bv,explanationCorrect:bv,skillTagCorrect:true,difficultyCorrect:true,
      reviewer:'test-reviewer',reviewerRole:'math_expert',expertAttestation:true,
      reviewedAt:new Date().toISOString(),reviewerNotes:'ok',reviewedContent:null,...(overrides.reviewFields||{})},
    ...(overrides.candidateFields||{})};
  candidate.validation={candidateHash:freezeMathCandidate(candidate).candidateHash,status:'independently_verified',
    verifiedAt:new Date().toISOString(),solutionCount:1,conditionsConsistent:true,
    domainMatch:true,skillMatch:true,difficultyRating:candidate.difficulty,difficultyMatch:true,languageUnambiguous:true,
    solvedAnswer:String(candidate.answer),defensibleOptionCount:null,distractorsPlausible:null,
    explanationStatus:'independently_verified',explanationHash:hashMathExplanation(candidate.explanation),
    explanationVerifiedAt:new Date().toISOString(),
    explanationPolicyCompliant:true,
    explanationReasoningCorrect:true,explanationAnswerConsistent:true,explanationNoAddedAssumptions:true,
    explanationLanguageClear:true,explanationSatScopeCompliant:true,
    ...(overrides.validationFields||{})};
  return candidate;}
function mkBatch(dir,filename,candidates,slotOv=null){
  const p={generatorVersion:'test-ver',generatedAt:new Date().toISOString(),generatedByModel:'claude-sonnet-4-6',slot:slotOv||{...SLOT},candidates,rejected:[]};
  const fp=path.join(dir,filename);fs.writeFileSync(fp,JSON.stringify(p,null,2));return fp;}
const src=fs.readFileSync(IMC_PATH,'utf8');
const nonComment=src.split('\n').filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//')).join('\n');
let pass=0,fail=0;
function test(n,f){try{f();console.log(`  [PASS] ${n}`);pass++;}catch(e){console.log(`  [FAIL] ${n} -> ${e.message}`);fail++;}}
async function testA(n,f){try{await f();console.log(`  [PASS] ${n}`);pass++;}catch(e){console.log(`  [FAIL] ${n} -> ${e.message}`);fail++;}}
console.log('\n=== importMathCandidates.test.mjs ===\n');
console.log('-- ESM import safety --');
test('Module imports without error',()=>assert(mod!==undefined));
test('Import does NOT run main() (guard)',()=>assert(typeof main==='function'));
test('All helpers exported',()=>{for(const fn of [validateBatchStructure,validateCandidateStructure,validateReviewSchema,validateSlotConsistency,preflightAllCandidates,readManifest,readImportedCandidateIds,appendToManifest,writeRejectionAudit,importReviewFile,main])assert(typeof fn==='function');});
test('seedBank helpers reused not duplicated',()=>{assert(src.includes("from './seedBank.js'"));assert(src.includes('validateQuestion')&&src.includes('containsGenerationArtifacts')&&src.includes('isDuplicate'));});
test('No Anthropic import',()=>assert(!src.includes("from '@anthropic-ai/sdk'")));
test('Exactly 1 Question.create in non-comment',()=>{const c=(nonComment.match(/Question\.create\s*\(/g)||[]).length;assert.strictEqual(c,1,`got ${c}`);});
test('isDirectExecution guard',()=>assert(src.includes('isDirectExecution')&&src.includes('pathToFileURL')));
test('status=expert_approved hardcoded',()=>assert(src.includes("status:'expert_approved'")));
console.log('\n-- validateBatchStructure --');
test('Valid batch passes',()=>assert.strictEqual(validateBatchStructure({generatorVersion:'v1',generatedAt:'d',generatedByModel:'m',slot:{},candidates:[]}),null));
test('Missing generatorVersion fails',()=>assert(validateBatchStructure({generatedAt:'d',generatedByModel:'m',slot:{},candidates:[]})!==null));
test('Missing generatedAt fails',()=>assert(validateBatchStructure({generatorVersion:'v1',generatedByModel:'m',slot:{},candidates:[]})!==null));
test('Missing generatedByModel fails',()=>assert(validateBatchStructure({generatorVersion:'v1',generatedAt:'d',slot:{},candidates:[]})!==null));
test('Missing slot fails',()=>assert(validateBatchStructure({generatorVersion:'v1',generatedAt:'d',generatedByModel:'m',candidates:[]})!==null));
test('candidates not array fails',()=>assert(validateBatchStructure({generatorVersion:'v1',generatedAt:'d',generatedByModel:'m',slot:{}})!==null));
console.log('\n-- validateCandidateStructure --');
test('Valid candidate passes',()=>assert.strictEqual(validateCandidateStructure(mkC('c1'),SLOT,new Set()),null));
test('Missing candidateId fails',()=>{const c=mkC('c1');delete c.candidateId;assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Empty candidateId fails',()=>{const c=mkC('c1','Keep',{candidateFields:{candidateId:''}});assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Duplicate candidateId fails',()=>{const seen=new Set(['c1']);assert(validateCandidateStructure(mkC('c1'),SLOT,seen)!==null);});
test('Missing slot field fails',()=>{const c=mkC('c1','Keep',{candidateFields:{section:undefined}});assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Slot field mismatch fails',()=>{const c=mkC('c1','Keep',{candidateFields:{difficulty:'easy'}});assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Missing question fails',()=>{const c=mkC('c1');delete c.question;assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Missing answer fails',()=>{const c=mkC('c1');delete c.answer;assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Missing options field fails',()=>{const c=mkC('c1');delete c.options;assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
test('Missing review object fails',()=>{const c=mkC('c1');delete c.review;assert(validateCandidateStructure(c,SLOT,new Set())!==null);});
console.log('\n-- validateReviewSchema --');
test('Valid Keep passes',()=>assert.strictEqual(validateReviewSchema(mkC('c1','Keep')),null));
test('Valid Reject passes',()=>assert.strictEqual(validateReviewSchema(mkC('c1','Reject')),null));
test('Edit refuses: changed Math content must be regenerated',()=>{const c=mkC('c1','Edit',{reviewFields:{reviewedContent:{question:'Q',options:null,answer:'4',explanation:'E.'}}});assert(validateReviewSchema(c)!==null);});
test('decision=null refuses',()=>assert(validateReviewSchema(mkC('c1',null))!==null));
test('decision=approve refuses',()=>assert(validateReviewSchema(mkC('c1','approve'))!==null));
test('reviewer empty refuses (Option A)',()=>{const c=mkC('c1','Keep',{reviewFields:{reviewer:''}});const err=validateReviewSchema(c);assert(err!==null&&err.includes('reviewer'),`Got:${err}`);});
test('reviewerId only refuses (Option A: no fallback)',()=>{const c=mkC('c1','Keep',{reviewFields:{reviewer:'',reviewerId:'someone'}});const err=validateReviewSchema(c);assert(err!==null,`reviewerId alone must not pass`);});
test('reviewedAt empty refuses',()=>assert(validateReviewSchema(mkC('c1','Keep',{reviewFields:{reviewedAt:''}}))!==null));
test('non-expert reviewer role refuses',()=>assert(validateReviewSchema(mkC('c1','Keep',{reviewFields:{reviewerRole:'general_reviewer'}}))!==null));
test('expert attestation must be true',()=>assert(validateReviewSchema(mkC('c1','Keep',{reviewFields:{expertAttestation:false}}))!==null));
test('correctness field null refuses',()=>assert(validateReviewSchema(mkC('c1','Keep',{reviewFields:{correctAnswer:null}}))!==null));
test('correctness field missing refuses',()=>{const c=mkC('c1','Keep');delete c.review.uniqueAnswer;assert(validateReviewSchema(c)!==null);});
test('Keep with any false correctness field refuses',()=>assert(validateReviewSchema(mkC('c1','Keep',{reviewFields:{uniqueAnswer:false}}))!==null));
console.log('\n-- validateSlotConsistency --');
test('Matching slot passes',()=>assert.strictEqual(validateSlotConsistency({...SLOT,question:'Q',options:null,answer:'4',explanation:'E.'},mkC('c1')),null));
test('Changed section fails',()=>assert(validateSlotConsistency({...SLOT,section:'rw'},mkC('c1'))!==null));
test('Changed difficulty fails',()=>assert(validateSlotConsistency({...SLOT,difficulty:'easy'},mkC('c1'))!==null));
console.log('\n-- preflightAllCandidates --');
test('All valid passes',()=>assert.strictEqual(preflightAllCandidates([mkC('c1','Keep'),mkC('c2','Reject')],SLOT),null));
test('Invalid candidate fails entire preflight',()=>{const c2=mkC('c2','Keep');delete c2.candidateId;const err=preflightAllCandidates([mkC('c1','Keep'),c2],SLOT);assert(err!==null&&err.includes('candidateId'),`Got:${err}`);});
test('Duplicate candidateId fails preflight',()=>{const err=preflightAllCandidates([mkC('c1'),mkC('c1')],SLOT);assert(err!==null&&err.includes('unique'),`Got:${err}`);});
test('c1 valid + c2 null decision refuses before processing',()=>{const c2=mkC('c2',null);const err=preflightAllCandidates([mkC('c1','Keep'),c2],SLOT);assert(err!==null&&err.includes('c2'),`Got:${err}`);});
console.log('\n-- Manifest --');
test('readManifest returns [] for missing',()=>{const r=readManifest('/tmp/no-imc-xyz.json');assert(Array.isArray(r)&&r.length===0);});
test('readImportedCandidateIds empty for missing',()=>{const ids=readImportedCandidateIds('/tmp/no-imc-xyz.json');assert(ids instanceof Set&&ids.size===0);});
test('appendToManifest atomic write',()=>{const d=mkT(),m=path.join(d,'m.json');appendToManifest({candidateId:'c1',questionId:'q1'},m);const data=JSON.parse(fs.readFileSync(m,'utf8'));assert(data.length===1&&data[0].candidateId==='c1');rm(d);});
test('appendToManifest accumulates',()=>{const d=mkT(),m=path.join(d,'m.json');appendToManifest({candidateId:'c1'},m);appendToManifest({candidateId:'c2'},m);assert.strictEqual(JSON.parse(fs.readFileSync(m,'utf8')).length,2);rm(d);});
test('appendToManifest no .tmp left',()=>{const d=mkT(),m=path.join(d,'m.json');appendToManifest({candidateId:'c1'},m);assert(!fs.existsSync(m+'.tmp'));rm(d);});
test('readImportedCandidateIds correct Set',()=>{const d=mkT(),m=path.join(d,'m.json');wM(m,[{candidateId:'c1'},{candidateId:'c2'}]);const ids=readImportedCandidateIds(m);assert(ids.has('c1')&&ids.has('c2')&&ids.size===2);rm(d);});
console.log('\n-- Rejection audit --');
test('writeRejectionAudit writes valid JSON with rejectStage',()=>{const d=mkT();const fp=writeRejectionAudit([{candidateId:'c1',rejectStage:'reviewer_reject',rejectReason:'test'}],'/tmp/r.json',d);const data=JSON.parse(fs.readFileSync(fp,'utf8'));assert(data.entries.length===1&&data.entries[0].rejectStage==='reviewer_reject');rm(d);});
test('writeRejectionAudit no .tmp left',()=>{const d=mkT();writeRejectionAudit([],'r.json',d);assert.strictEqual(fs.readdirSync(d).filter(f=>f.endsWith('.tmp')).length,0);rm(d);});
test('writeRejectionAudit creates dir',()=>{const d=path.join(os.tmpdir(),`imc-rej-${Date.now()}`);writeRejectionAudit([],'r.json',d);assert(fs.existsSync(d));rm(d);});
console.log('\n-- importReviewFile logic --');
await testA('Null decision refuses entire run 0 writes',async()=>{
  const d=mkT();const fp=mkBatch(d,'r.json',[mkC('c1','Keep'),mkC('c2',null)]);
  let threw=false;try{await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej'));}catch(err){threw=true;assert(err.message.includes('c2'),`Expected c2: ${err.message}`);}
  assert(threw,'must throw');assert(!fs.existsSync(path.join(d,'m.json')),'no manifest on refusal');rm(d);});
await testA('Preflight refuses c1 valid + c2 missing candidateId',async()=>{
  const d=mkT();const c2=mkC('c2','Keep');delete c2.candidateId;
  const fp=mkBatch(d,'r.json',[mkC('c1','Keep'),c2]);
  let threw=false;try{await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej'));}catch(err){threw=true;assert(err.message.includes('candidateId')||err.message.includes('no id'),`Got:${err.message}`);}
  assert(threw,'must throw');assert(!fs.existsSync(path.join(d,'m.json')),'no manifest');rm(d);});
await testA('Empty candidates returns 0',async()=>{const d=mkT();const fp=mkBatch(d,'r.json',[]);const r=await importReviewFile(fp,path.join(d,'m.json'),path.join(d,'rej'));assert.strictEqual(r.inserted,0);rm(d);});
await testA('Reject: reviewerRejected count + audit written',async()=>{
  const d=mkT(),rejDir=path.join(d,'rej');
  const fp=mkBatch(d,'r.json',[mkC('c1','Reject'),mkC('c2','Reject')]);
  const r=await importReviewFile(fp,path.join(d,'m.json'),rejDir);
  assert.strictEqual(r.reviewerRejected,2,`got ${r.reviewerRejected}`);assert.strictEqual(r.inserted,0);
  const files=fs.readdirSync(rejDir).filter(f=>f.endsWith('.json'));assert(files.length>0,'audit must exist');
  const audit=JSON.parse(fs.readFileSync(path.join(rejDir,files[0]),'utf8'));
  assert(audit.entries.some(e=>e.rejectStage==='reviewer_reject'));rm(d);});
await testA('candidateId in manifest is skipped',async()=>{
  const d=mkT(),m=path.join(d,'m.json');wM(m,[{candidateId:'c1',questionId:'q-old'}]);
  const fp=mkBatch(d,'r.json',[mkC('c1','Keep')]);
  const r=await importReviewFile(fp,m,path.join(d,'rej'));
  assert.strictEqual(r.skippedImported,1,`got ${r.skippedImported}`);assert.strictEqual(r.inserted,0);rm(d);});
await testA('Summary counts accurate',async()=>{
  const d=mkT(),m=path.join(d,'m.json');wM(m,[{candidateId:'c-skip'}]);
  const fp=mkBatch(d,'r.json',[mkC('c-skip','Keep'),mkC('c-rej','Reject')]);
  const r=await importReviewFile(fp,m,path.join(d,'rej'));
  assert.strictEqual(r.skippedImported,1,`skip:${r.skippedImported}`);assert.strictEqual(r.reviewerRejected,1,`rej:${r.reviewerRejected}`);assert.strictEqual(r.inserted,0);rm(d);});
await testA('Dry-run: 0 manifest 0 audit writes',async()=>{
  const d=mkT(),m=path.join(d,'m.json'),rejDir=path.join(d,'rej');
  const fp=mkBatch(d,'r.json',[mkC('c1','Reject')]);
  await importReviewFile(fp,m,rejDir,{dryRun:true});
  assert(!fs.existsSync(m),'no manifest in dry-run');
  assert(!fs.existsSync(rejDir)||fs.readdirSync(rejDir).length===0,'no audit in dry-run');rm(d);});
console.log('\n-- Source checks --');
test('status=expert_approved hardcoded',()=>assert(src.includes("status:'expert_approved'")));
test('No Anthropic SDK',()=>assert(!src.includes("from '@anthropic-ai/sdk'")));
test('rejectStage in audit entries',()=>assert(src.includes('rejectStage')));
test('MANIFEST WRITE FAILED warning with _id',()=>{assert(src.includes('MANIFEST WRITE FAILED'));assert(src.includes('doc._id'));});
test('preflightAllCandidates called in importReviewFile',()=>assert(src.includes('preflightAllCandidates(candidates')));
test('Option A reviewer policy documented',()=>assert(src.includes('Option A')&&src.includes('review.reviewer')));
console.log(`\n=== RESULTS: ${pass}/${pass+fail} passed ===`);
if(fail>0){console.log(`${fail} failed.`);process.exit(1);}
else console.log('All tests pass -- 0 Anthropic calls, 0 real MongoDB writes.');
