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
fs.rmSync(outputDir,{recursive:true});
console.log('=== RESULTS: 1/1 end-to-end fixture passed ===');
