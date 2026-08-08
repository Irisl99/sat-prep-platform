import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import Question from '../src/models/Question.js';
import {
  validateQuestion, containsGenerationArtifacts, checkExplicitAnswerConsistency,
  isDuplicate,
} from './seedBank.js';
import {
  findSatScopeViolation, validateStoredIndependentVerification, validateTypeSpecificAnswer,
} from '../src/services/mathCandidateValidation.js';

const __dirname        = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = join(__dirname, '..', 'data', 'math-imports', 'imported-candidates.json');
const DEFAULT_REJ_DIR  = join(__dirname, '..', 'data', 'math-rejections');
const CORRECTNESS_FIELDS = ['correctAnswer','uniqueAnswer','conditionsConsistent','explanationCorrect','skillTagCorrect','difficultyCorrect'];
const VALID_DECISIONS    = ['Keep','Reject'];
const SLOT_FIELDS        = ['section','domain','skill','difficulty','type'];
const CONTENT_FIELDS     = ['question','answer','explanation'];

export function validateBatchStructure(data) {
  if (!data || typeof data !== 'object') return 'review file is not a JSON object';
  if (!data.generatorVersion) return 'generatorVersion missing';
  if (!data.generatedAt) return 'generatedAt missing';
  if (!data.generatedByModel) return 'generatedByModel missing';
  if (!data.slot || typeof data.slot !== 'object') return 'slot metadata missing';
  if (!Array.isArray(data.candidates)) return 'candidates is not an array';
  return null;
}

export function validateCandidateStructure(candidate, batchSlot, seenIds) {
  if (!candidate.candidateId || typeof candidate.candidateId !== 'string' || candidate.candidateId.trim() === '')
    return 'candidateId is missing or empty';
  if (seenIds.has(candidate.candidateId))
    return `candidateId "${candidate.candidateId}" is not unique within this batch`;
  for (const f of SLOT_FIELDS) {
    if (!candidate[f]) return `missing immutable metadata: ${f}`;
    if (batchSlot[f] && candidate[f] !== batchSlot[f])
      return `immutable metadata "${f}" ("${candidate[f]}") does not match batch slot ("${batchSlot[f]}")`;
  }
  for (const f of CONTENT_FIELDS) {
    if (!(f in candidate) || candidate[f] === undefined || candidate[f] === null)
      return `original content field missing: ${f}`;
  }
  if (!('options' in candidate)) return 'original content field missing: options';
  if (!candidate.review || typeof candidate.review !== 'object') return 'review object missing';
  return null;
}

// REVIEWER FIELD POLICY (Option A): only review.reviewer is accepted.
// review.reviewerId is not accepted as a fallback.
export function validateReviewSchema(candidate) {
  const r = candidate.review;
  if (!r) return 'review block missing';
  const dec = r.decision;
  if (dec === null || dec === undefined) return 'decision is null';
  if (!VALID_DECISIONS.includes(dec))
    return `decision "${dec}" must be Keep/Reject; changed Math content must be rejected and regenerated`;
  if (!r.reviewer || String(r.reviewer).trim() === '')
    return 'review.reviewer is missing or empty (Option A: only review.reviewer accepted; review.reviewerId is not a valid fallback)';
  if (!r.reviewedAt || String(r.reviewedAt).trim() === '') return 'review.reviewedAt is missing or empty';
  if (r.reviewerRole !== 'math_expert') return 'review.reviewerRole must be exactly math_expert';
  if (r.expertAttestation !== true) return 'review.expertAttestation must be true';
  for (const f of CORRECTNESS_FIELDS) {
    if (!(f in r)) return `review missing required correctness field: ${f}`;
    if (typeof r[f] !== 'boolean') return `review.${f} must be an explicit boolean, not ${JSON.stringify(r[f])}`;
  }
  if (dec === 'Keep') {
    const failedChecks = CORRECTNESS_FIELDS.filter(f => r[f] !== true);
    if (failedChecks.length > 0)
      return `Keep requires all correctness fields=true; failed: ${failedChecks.join(', ')}`;
  }
  return null;
}

export function validateSlotConsistency(finalContent, originalCandidate) {
  for (const field of SLOT_FIELDS) {
    if (finalContent[field] !== originalCandidate[field])
      return `slot field "${field}" changed: original="${originalCandidate[field]}" final="${finalContent[field]}"`;
  }
  return null;
}

export function preflightAllCandidates(candidates, batchSlot) {
  const seenIds = new Set();
  for (const c of candidates) {
    const structErr = validateCandidateStructure(c, batchSlot, seenIds);
    if (structErr) return `Preflight failed on candidate "${c.candidateId || '(no id)'}": ${structErr}`;
    seenIds.add(c.candidateId);
    const schemaErr = validateReviewSchema(c);
    if (schemaErr) return `Preflight failed on candidate "${c.candidateId}": ${schemaErr}`;
  }
  return null;
}

export function readManifest(manifestPath = DEFAULT_MANIFEST) {
  if (!existsSync(manifestPath)) return [];
  try { const data = JSON.parse(readFileSync(manifestPath,'utf8')); return Array.isArray(data)?data:[]; }
  catch { return []; }
}
export function readImportedCandidateIds(manifestPath = DEFAULT_MANIFEST) {
  return new Set(readManifest(manifestPath).map(e=>e.candidateId).filter(Boolean));
}
export function appendToManifest(record, manifestPath = DEFAULT_MANIFEST) {
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) mkdirSync(dir,{recursive:true});
  const existing = readManifest(manifestPath); existing.push(record);
  const tmpPath = manifestPath+'.tmp';
  writeFileSync(tmpPath,JSON.stringify(existing,null,2),'utf8');
  renameSync(tmpPath,manifestPath);
}
export function writeRejectionAudit(entries, reviewFile, rejDir = DEFAULT_REJ_DIR) {
  if (!existsSync(rejDir)) mkdirSync(rejDir,{recursive:true});
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const base = reviewFile.split('/').pop().replace('.json','');
  const filename = `rejection_${base}_${ts}.json`;
  const finalPath = join(rejDir,filename); const tmpPath = finalPath+'.tmp';
  writeFileSync(tmpPath,JSON.stringify({reviewFile,rejectedAt:new Date().toISOString(),entries},null,2),'utf8');
  renameSync(tmpPath,finalPath); return finalPath;
}

export async function importReviewFile(reviewFilePath, manifestPath, rejDir, { dryRun=false }={}) {
  let reviewData;
  try { reviewData = JSON.parse(readFileSync(reviewFilePath,'utf8')); }
  catch(err) { throw new Error(`Cannot read review file: ${err.message}`); }
  const batchErr = validateBatchStructure(reviewData);
  if (batchErr) throw new Error(`Batch validation failed: ${batchErr}`);
  const candidates = reviewData.candidates;
  if (candidates.length === 0) {
    console.log('[import] No candidates.');
    return {inserted:0,reviewerRejected:0,gateRejected:0,skippedImported:0,dbErrors:0,manifestErrors:0};
  }
  const preflightErr = preflightAllCandidates(candidates, reviewData.slot);
  if (preflightErr) throw new Error(preflightErr);
  const importedIds = readImportedCandidateIds(manifestPath);
  let inserted=0,reviewerRejected=0,gateRejected=0,skippedImported=0,dbErrors=0,manifestErrors=0;
  const rejectionLog=[];
  for (const candidate of candidates) {
    const {candidateId} = candidate; const decision = candidate.review.decision;
    if (decision === 'Reject') {
      const tag = dryRun?'[dry-run][reject]':'[reject]';
      console.log(`  ${tag} ${candidateId}: reviewer decision=Reject`);
      rejectionLog.push({candidateId,decision:'Reject',rejectStage:'reviewer_reject',rejectReason:'reviewer decision=Reject',reviewer:candidate.review.reviewer,reviewedAt:candidate.review.reviewedAt,reviewFile:reviewFilePath,recordedAt:new Date().toISOString()});
      reviewerRejected++; continue;
    }
    if (importedIds.has(candidateId)) {
      const tag=dryRun?'[dry-run][skip]':'[skip]';
      console.log(`  ${tag} ${candidateId}: already in manifest`);
      skippedImported++; continue;
    }
    const slot={section:candidate.section,domain:candidate.domain,skill:candidate.skill,difficulty:candidate.difficulty,type:candidate.type};
    const finalContent={...slot,question:candidate.question,options:candidate.options,answer:candidate.answer,explanation:candidate.explanation};
    const addGateReject=(stage,reason)=>{
      const tag=dryRun?'[dry-run][gate_reject]':'[gate_reject]';
      console.warn(`  ${tag} ${candidateId}: ${stage}: ${reason}`);
      rejectionLog.push({candidateId,decision,rejectStage:stage,rejectReason:reason,reviewer:candidate.review.reviewer,reviewedAt:candidate.review.reviewedAt,reviewFile:reviewFilePath,recordedAt:new Date().toISOString()});
      gateRejected++;
    };
    const slotErr=validateSlotConsistency(finalContent,candidate);
    if (slotErr) { addGateReject('slot_consistency',slotErr); continue; }
    let structErr; try{validateQuestion(finalContent,slot);}catch(err){structErr=err.message;}
    if (structErr) { addGateReject('structural',structErr); continue; }
    const artifact=containsGenerationArtifacts(finalContent);
    if (artifact) { addGateReject('artifact',`matched "${artifact}"`); continue; }
    const consistency=checkExplicitAnswerConsistency(finalContent,slot);
    if (consistency) { addGateReject('consistency',consistency); continue; }
    const typeError=validateTypeSpecificAnswer(finalContent);
    if (typeError) { addGateReject('answer_format',typeError); continue; }
    const verificationError=validateStoredIndependentVerification(candidate);
    if (verificationError) { addGateReject('independent_verification',verificationError); continue; }
    const scopeViolation=findSatScopeViolation(finalContent.question,finalContent.explanation);
    if (scopeViolation) { addGateReject('sat_scope',`forbidden topic or method: ${scopeViolation}`); continue; }
    const dup=await isDuplicate(finalContent.question);
    if (dup) { addGateReject('duplicate','question already exists'); continue; }
    if (dryRun) { console.log(`  [dry-run][would-insert] ${candidateId}`); inserted++; continue; }
    let doc;
    try {
      doc = await Question.create({
        section:finalContent.section,domain:finalContent.domain,skill:finalContent.skill,
        difficulty:finalContent.difficulty,type:finalContent.type,
        passage:null,passageSource:null,question:finalContent.question,
        options:finalContent.options??null,answer:String(finalContent.answer),
        explanation:finalContent.explanation,status:'expert_approved',
        version:1,generatedByModel:reviewData.generatedByModel,
        generatedAt:reviewData.generatedAt?new Date(reviewData.generatedAt):new Date(),
        candidateId,candidateHash:candidate.validation.candidateHash,
        independentlyVerifiedAt:new Date(candidate.validation.verifiedAt),
        expertApprovedAt:new Date(candidate.review.reviewedAt),
        expertValidatedAt:new Date(candidate.review.reviewedAt),
        expertId:candidate.review.reviewer,expertNotes:candidate.review.reviewerNotes||null,
        useCount:0,lastUsedAt:null,
      });
    } catch(err) {
      console.error(`  [db_error] ${candidateId}: ${err.message}`);
      rejectionLog.push({candidateId,decision,rejectStage:'db_error',rejectReason:err.message,reviewer:candidate.review.reviewer,reviewedAt:candidate.review.reviewedAt,reviewFile:reviewFilePath,recordedAt:new Date().toISOString()});
      dbErrors++; continue;
    }
    console.log(`  [imported] ${candidateId} -> _id=${doc._id}`);
    inserted++; importedIds.add(candidateId);
    const record={candidateId,questionId:String(doc._id),reviewFile:reviewFilePath,reviewer:candidate.review.reviewer,decision,status:'expert_approved',importedAt:new Date().toISOString()};
    try { appendToManifest(record,manifestPath); }
    catch(err) {
      manifestErrors++;
      console.error(`  *** MANIFEST WRITE FAILED ***`);
      console.error(`  candidateId: ${candidateId}`);
      console.error(`  inserted _id: ${doc._id}`);
      console.error(`  ACTION REQUIRED: Record manually.`);
    }
  }
  if (!dryRun && rejectionLog.length>0) {
    try { const ap=writeRejectionAudit(rejectionLog,reviewFilePath,rejDir); console.log(`  [audit] Written: ${ap}`); }
    catch(err) { console.warn(`  [audit_warn] ${err.message}`); }
  }
  return {inserted,reviewerRejected,gateRejected,skippedImported,dbErrors,manifestErrors};
}

export async function main() {
  const args=process.argv.slice(2);
  const fileIdx=args.indexOf('--file'); const isDryRun=args.includes('--dry-run');
  const mPath=process.env.MATH_IMPORT_MANIFEST||DEFAULT_MANIFEST;
  const rejDir=process.env.MATH_REJECTION_DIR||DEFAULT_REJ_DIR;
  if (fileIdx===-1||!args[fileIdx+1]) { console.error('[importMathCandidates] Usage: --file <file> [--dry-run]'); process.exit(1); }
  const reviewFilePath=args[fileIdx+1];
  if (!existsSync(reviewFilePath)) { console.error(`[importMathCandidates] File not found: ${reviewFilePath}`); process.exit(1); }
  console.log('\n=== importMathCandidates.mjs ===');
  console.log(`Mode: ${isDryRun?'DRY RUN':'LIVE'}`);
  await mongoose.connect(process.env.MONGODB_URI);
  let result;
  try { result=await importReviewFile(reviewFilePath,mPath,rejDir,{dryRun:isDryRun}); }
  catch(err) { console.error(`Fatal: ${err.message}`); await mongoose.disconnect(); process.exit(1); }
  console.log(`\n=== ${isDryRun?'DRY RUN':'IMPORT'} COMPLETE ===`);
  console.log(`  inserted: ${result.inserted}`);
  console.log(`  reviewer rejected: ${result.reviewerRejected}`);
  console.log(`  gate rejected: ${result.gateRejected}`);
  console.log(`  skipped: ${result.skippedImported}`);
  console.log(`  db errors: ${result.dbErrors}`);
  console.log(`  manifest errors: ${result.manifestErrors}`);
  if (result.manifestErrors) console.error('WARNING: manifest write(s) failed.');
  await mongoose.disconnect();
}

const isDirectExecution = Boolean(process.argv[1]) && import.meta.url===pathToFileURL(process.argv[1]).href;
if (isDirectExecution) { main().catch(err=>{ console.error('[importMathCandidates] Fatal:',err.message); process.exit(1); }); }
