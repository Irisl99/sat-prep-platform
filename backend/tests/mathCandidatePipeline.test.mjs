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
  const client={messages:{create:async request=>{sent=request.messages[0].content;assert.deepStrictEqual(request.tool_choice,{type:'tool',name:'return_json',disable_parallel_tool_use:true});return{stop_reason:'tool_use',content:[{type:'tool_use',name:'return_json',input:{candidateHash:'h',status:'solved',conditionsConsistent:true,domainMatch:true,skillMatch:true,difficultyRating:'easy',difficultyMatch:true,languageUnambiguous:true,solutionCount:1,answer:'B',defensibleOptionCount:1,distractorsPlausible:true,method:'algebra',solution:'x=2'}}]};}}};
  const solve=createAnthropicBlindSolver(client);
  await solve({candidateHash:'h',question:'What is x?',options:['1','2','3','4'],type:'mcq'});
  const frozen=sent.split('FROZEN PROBLEM:\n')[1];
  assert(!frozen.includes('"answer"'));
  assert(!frozen.includes('"explanation"'));
  assert(sent.includes('Never change numbers'));
  assert(sent.includes('difficultyRating'));
  assert(sent.includes('distractorsPlausible'));
});

await test('verified explainer uses verified solution after validation', async () => {
  let sent='';
  const client={messages:{create:async request=>{sent=request.messages[0].content;return{stop_reason:'tool_use',content:[{type:'tool_use',name:'return_json',input:{explanation:'Solve to get x = 2.'}}]};}}};
  const explain=createAnthropicVerifiedExplainer(client);
  const value=await explain({candidate:{question:'What is x?',options:null,type:'grid'},solverResult:{answer:'2',method:'algebra',solution:'x=2'}});
  assert.strictEqual(value,'Solve to get x = 2.');
  assert(sent.indexOf('VERIFIED ANSWER')>sent.indexOf('FROZEN QUESTION'));
});

await test('strict JSON rejects arrays and prose', async () => {
  assert.throws(()=>parseStrictJsonObject('[]'),error=>error.code==='MODEL_JSON_CONTRACT');
  assert.throws(()=>parseStrictJsonObject('Here is JSON: {}'),error=>error.code==='MODEL_JSON_CONTRACT');
});

await test('blind solver retries strict format once without answer leakage', async () => {
  let calls=0;const prompts=[];
  const valid={candidateHash:'h',status:'solved',conditionsConsistent:true,domainMatch:true,skillMatch:true,
    difficultyRating:'easy',difficultyMatch:true,languageUnambiguous:true,solutionCount:1,answer:'B',
    defensibleOptionCount:1,distractorsPlausible:true,method:'algebra',solution:'x=2'};
  const client={messages:{create:async request=>{prompts.push(request.messages[0].content);calls++;
    return calls===1?{stop_reason:'end_turn',content:[{type:'text',text:'I need to solve this first.'}]}:{stop_reason:'tool_use',content:[{type:'tool_use',name:'return_json',input:valid}]};}}};
  const result=await createAnthropicBlindSolver(client)({candidateHash:'h',question:'Q?',options:['1','2','3','4'],type:'mcq'});
  assert.strictEqual(calls,2);assert.strictEqual(result.formatRetries,1);
  assert(prompts[1].startsWith('FORMAT RETRY:'));
  for(const prompt of prompts){const frozen=prompt.split('FROZEN PROBLEM:\n')[1];assert(!frozen.includes('"answer"'));assert(!frozen.includes('"explanation"'));}
});

await test('blind solver does not retry transport errors or more than once', async () => {
  let transportCalls=0;
  const transport={messages:{create:async()=>{transportCalls++;throw new Error('network down');}}};
  await assert.rejects(()=>createAnthropicBlindSolver(transport)({candidateHash:'h',question:'Q'}));
  assert.strictEqual(transportCalls,1);
  let formatCalls=0;
  const malformed={messages:{create:async()=>{formatCalls++;return{stop_reason:'end_turn',content:[{type:'text',text:'not json'}]};}}};
  await assert.rejects(()=>createAnthropicBlindSolver(malformed)({candidateHash:'h',question:'Q'}),error=>error.code==='MODEL_JSON_CONTRACT');
  assert.strictEqual(formatCalls,2);
});

console.log(`=== RESULTS: ${passed}/${passed} passed ===`);
