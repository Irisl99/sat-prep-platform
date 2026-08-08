import assert from 'assert';
import {
  buildMathQuestionPrompt, createAnthropicBlindSolver,
  createAnthropicVerifiedExplainer, parseStrictJsonObject,
} from '../src/services/mathCandidatePipeline.js';

let passed=0;
async function test(name, fn) { await fn(); console.log(`[PASS] ${name}`); passed++; }

await test('question prompt prohibits premature explanation and repair', async () => {
  const prompt=buildMathQuestionPrompt({domain:'Algebra',skill:'Linear Equations',difficulty:'hard',type:'mcq'},2);
  assert(prompt.includes('Do not produce an explanation'));
  assert(prompt.includes('Never repair or reinterpret'));
});

await test('blind solver prompt excludes intended answer and explanation', async () => {
  let sent='';
  const client={messages:{create:async request=>{sent=request.messages[0].content;return{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({candidateHash:'h',status:'solved',conditionsConsistent:true,solutionCount:1,answer:'B',defensibleOptionCount:1,method:'algebra',solution:'x=2'})}]};}}};
  const solve=createAnthropicBlindSolver(client);
  await solve({candidateHash:'h',question:'What is x?',options:['1','2','3','4'],type:'mcq'});
  const frozen=sent.split('FROZEN PROBLEM:\n')[1];
  assert(!frozen.includes('"answer"'));
  assert(!frozen.includes('"explanation"'));
  assert(sent.includes('Never change numbers'));
});

await test('verified explainer uses verified solution after validation', async () => {
  let sent='';
  const client={messages:{create:async request=>{sent=request.messages[0].content;return{stop_reason:'end_turn',content:[{type:'text',text:'{"explanation":"Solve to get x = 2."}'}]};}}};
  const explain=createAnthropicVerifiedExplainer(client);
  const value=await explain({candidate:{question:'What is x?',options:null,type:'grid'},solverResult:{answer:'2',method:'algebra',solution:'x=2'}});
  assert.strictEqual(value,'Solve to get x = 2.');
  assert(sent.indexOf('VERIFIED ANSWER')>sent.indexOf('FROZEN QUESTION'));
});

await test('strict JSON rejects arrays and prose', async () => {
  assert.throws(()=>parseStrictJsonObject('[]'));
  assert.throws(()=>parseStrictJsonObject('Here is JSON: {}'));
});

console.log(`=== RESULTS: ${passed}/${passed} passed ===`);
