import assert from 'assert';
import fs from 'fs';
import {
  MATH_PRODUCTION_STATUS, buildMathProductionFilter,
  findExpertApprovedMathQuestions, validateMathProductionQuestion,
} from '../src/services/mathProductionGate.js';
import { hashMathExplanation } from '../src/services/mathCandidateValidation.js';

let passed=0;
async function test(name, fn){await fn();console.log(`[PASS] ${name}`);passed++;}
const approved={section:'math',type:'mcq',answer:'B',status:'expert_approved',expertId:'expert-1',explanation:'Verified explanation for B.',
  expertApprovedAt:new Date(),candidateId:'candidate-1',candidateHash:'hash-1',independentlyVerifiedAt:new Date(),
  explanationVerifiedAt:new Date(),explanationHash:hashMathExplanation('Verified explanation for B.')};

await test('production filter overrides caller attempts to bypass section or status',()=>{
  assert.deepStrictEqual(buildMathProductionFilter({section:'rw',status:'active',domain:'Algebra'}),
    {section:'math',status:'expert_approved',domain:'Algebra'});
});
await test('approved record with complete provenance passes',()=>assert.strictEqual(validateMathProductionQuestion(approved),null));
await test('unreviewed and legacy active records fail closed',()=>{
  assert(validateMathProductionQuestion({...approved,status:'structurally_validated'}));
  assert(validateMathProductionQuestion({...approved,status:'active'}));
});
await test('missing expert or independent provenance fails closed',()=>{
  assert(validateMathProductionQuestion({...approved,expertId:null}));
  assert(validateMathProductionQuestion({...approved,candidateHash:null}));
  assert(validateMathProductionQuestion({...approved,independentlyVerifiedAt:null}));
  assert(validateMathProductionQuestion({...approved,explanationVerifiedAt:null}));
  assert(validateMathProductionQuestion({...approved,explanation:'changed'}));
  const badExplanation='Why the other choices are wrong: A) 1';
  assert(validateMathProductionQuestion({...approved,explanation:badExplanation,
    explanationHash:hashMathExplanation(badExplanation)}));
});
await test('database query is forced through expert_approved filter',async()=>{
  let received;
  const QuestionModel={find(filter){received=filter;return{limit(){return this;},async lean(){return[approved];}};}};
  const rows=await findExpertApprovedMathQuestions({status:'active'},{limit:2,QuestionModel});
  assert.strictEqual(received.status,MATH_PRODUCTION_STATUS);assert.strictEqual(rows.length,1);
});
await test('invalid database result rejects entire read',async()=>{
  const QuestionModel={find(){return{async lean(){return[{...approved,expertId:null}];}};}};
  await assert.rejects(()=>findExpertApprovedMathQuestions({}, {QuestionModel}),error=>error.code==='MATH_PRODUCTION_GATE_REJECTED');
});
await test('Exam and questionBank are intentionally not wired in Phase C',()=>{
  const exam=fs.readFileSync(new URL('../src/routes/exam.js',import.meta.url),'utf8');
  const bank=fs.readFileSync(new URL('../src/services/questionBank.js',import.meta.url),'utf8');
  assert(!exam.includes('mathProductionGate'));assert(!bank.includes('mathProductionGate'));
});
await test('Question schema includes explicit expert_approved lifecycle state',()=>{
  const schema=fs.readFileSync(new URL('../src/models/Question.js',import.meta.url),'utf8');
  assert(schema.includes("'expert_approved'"));assert(schema.includes('expertApprovedAt'));
});

console.log(`=== RESULTS: ${passed}/${passed} passed ===`);
