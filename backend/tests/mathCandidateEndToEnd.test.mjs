import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateSlot } from '../scripts/generateMathCandidates.mjs';

const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'math-e2e-'));
const slot={section:'math',domain:'Algebra',skill:'Linear Equations 1-var',difficulty:'easy',type:'mcq'};
const generated=[{section:'math',domain:slot.domain,skill:slot.skill,difficulty:'easy',type:'mcq',
  question:'If 2x = 8, what is the value of x?',options:['A. 2','B. 3','C. 4','D. 6'],answer:'C'}];
const client={messages:{create:async()=>({stop_reason:'end_turn',usage:{},content:[{type:'text',text:JSON.stringify(generated)}]})}};
let solverSawAnswer=false;
const result=await generateSlot(client,slot,'fixture-version',outputDir,'/tmp/not-used.json',1,{
  isDuplicate:async()=>false,
  solveBlind:async input=>{solverSawAnswer='answer' in input||'explanation' in input;return{
    candidateHash:input.candidateHash,status:'solved',conditionsConsistent:true,
    domainMatch:true,skillMatch:true,difficultyRating:'easy',difficultyMatch:true,languageUnambiguous:true,
    solutionCount:1,answer:'C',defensibleOptionCount:1,distractorsPlausible:true,
    method:'algebra',solution:'Divide both sides by 2 to get x = 4.'};},
  explainVerified:async()=> 'Divide both sides by 2, so x = 4.',
});
assert.strictEqual(result.candidates,1);
assert.strictEqual(solverSawAnswer,false);
const payload=JSON.parse(fs.readFileSync(result.filePath,'utf8'));
assert.strictEqual(payload.candidates[0].validation.status,'independently_verified');
assert.strictEqual(payload.candidates[0].validation.difficultyRating,'easy');
assert.strictEqual(payload.candidates[0].explanation,'Divide both sides by 2, so x = 4.');
assert.strictEqual(payload.candidates[0].review.decision,null);

const rejectedResult=await generateSlot(client,slot,'fixture-version',outputDir,'/tmp/not-used.json',1,{
  isDuplicate:async()=>false,
  solveBlind:async input=>({candidateHash:input.candidateHash,status:'solved',conditionsConsistent:true,
    domainMatch:true,skillMatch:true,difficultyRating:'easy',difficultyMatch:true,languageUnambiguous:true,
    solutionCount:1,answer:'B',defensibleOptionCount:1,distractorsPlausible:true,
    method:'algebra',solution:'Divide both sides by 2 to get x = 4.'}),
  explainVerified:async()=>{throw new Error('must not explain rejected candidate');},
});
assert.strictEqual(rejectedResult.rejected,1);
const rejectedPayload=JSON.parse(fs.readFileSync(rejectedResult.filePath,'utf8'));
const rejection=rejectedPayload.rejected[0];
assert.strictEqual(rejection.rejectReason,'stored answer disagrees with independent solver');
assert.strictEqual(rejection.auditEvidence.generatorAnswer,'C');
assert.strictEqual(rejection.auditEvidence.solverEvidence.answer,'B');
assert.strictEqual(rejection.auditEvidence.frozenProblem.answer,undefined);
assert.strictEqual(rejection.auditEvidence.frozenProblem.explanation,undefined);
assert.strictEqual(rejection.auditEvidence.frozenProblem.candidateHash,rejection.auditEvidence.solverEvidence.candidateHash);
assert(rejection.auditEvidence.note.includes('must not be used to repair'));

const explanationRejectResult=await generateSlot(client,slot,'fixture-version',outputDir,'/tmp/not-used.json',1,{
  isDuplicate:async()=>false,
  solveBlind:async input=>({candidateHash:input.candidateHash,status:'solved',conditionsConsistent:true,
    domainMatch:true,skillMatch:true,difficultyRating:'easy',difficultyMatch:true,languageUnambiguous:true,
    solutionCount:1,answer:'C',defensibleOptionCount:1,distractorsPlausible:true,
    method:'algebra',solution:'Divide both sides by 2 to get x = 4.'}),
  explainVerified:async()=> 'Let me reconsider. Divide both sides by 2.',
});
assert.strictEqual(explanationRejectResult.rejected,1);
const explanationRejectPayload=JSON.parse(fs.readFileSync(explanationRejectResult.filePath,'utf8'));
const explanationRejection=explanationRejectPayload.rejected[0];
assert.strictEqual(explanationRejection.rejectGate,'artifact_reject');
assert.strictEqual(explanationRejection.auditEvidence.generatorAnswer,'C');
assert.strictEqual(explanationRejection.auditEvidence.solverEvidence.answer,'C');
assert.strictEqual(explanationRejection.auditEvidence.generatedExplanation,'Let me reconsider. Divide both sides by 2.');
fs.rmSync(outputDir,{recursive:true});
console.log('=== RESULTS: 3/3 end-to-end fixtures passed ===');
