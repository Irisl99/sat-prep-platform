import assert from 'assert';
import {
  answersEquivalent,
  createBlindSolverInput,
  findSatScopeViolation,
  freezeMathCandidate,
  findSetLevelDuplicate,
  independentlyValidateMathCandidate,
  validateStoredIndependentVerification,
  validateIndependentSolverResult,
  validateTypeSpecificAnswer,
} from '../src/services/mathCandidateValidation.js';

const mcq = {
  section: 'math', domain: 'Algebra', skill: 'Linear Equations 1-var',
  difficulty: 'easy', type: 'mcq', question: 'If 2x = 8, what is x?',
  options: ['A. 2', 'B. 3', 'C. 4', 'D. 6'], answer: 'C',
  explanation: 'Generator explanation must not reach the blind solver.',
};
const grid = { ...mcq, type: 'grid', options: null, answer: '1/2' };

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  [PASS] ${name}`); passed++; }
  catch (error) { console.error(`  [FAIL] ${name}: ${error.message}`); process.exitCode = 1; }
}

await test('frozen candidate hash changes with stem', () => {
  assert.notStrictEqual(freezeMathCandidate(mcq).candidateHash,
    freezeMathCandidate({ ...mcq, question: 'Changed' }).candidateHash);
});
await test('blind solver input excludes intended answer and explanation', () => {
  const input = createBlindSolverInput(mcq);
  assert(!('answer' in input));
  assert(!('explanation' in input));
  assert(input.candidateHash);
});
await test('SAT scope blocker covers calculus methods', () => {
  assert.strictEqual(findSatScopeViolation('Use a derivative to maximize the area.'), 'derivative');
  assert.strictEqual(findSatScopeViolation('Solve by ordinary algebra.'), null);
});
await test('MCQ and SPR answer gates are type-specific', () => {
  assert.strictEqual(validateTypeSpecificAnswer(mcq), null);
  assert.strictEqual(validateTypeSpecificAnswer(grid), null);
  assert(validateTypeSpecificAnswer({ ...mcq, answer: '4' }));
  assert(validateTypeSpecificAnswer({ ...grid, answer: 'A' }));
});
await test('equivalent fraction and decimal SPR answers match', () => {
  assert(answersEquivalent('grid', '1/2', '0.5'));
});
await test('SPR rejects non-null or string-null MCQ-only solver fields', () => {
  const valid = {
    candidateHash: freezeMathCandidate(grid).candidateHash, status: 'solved', conditionsConsistent: true,
    domainMatch: true, skillMatch: true, difficultyRating: 'easy', difficultyMatch: true,
    languageUnambiguous: true, solutionCount: 1, answer: '0.5',
    defensibleOptionCount: null, distractorsPlausible: null, method: 'algebra', solution: 'x = 1/2',
  };
  assert.strictEqual(validateIndependentSolverResult(grid, valid), null);
  assert.match(validateIndependentSolverResult(grid, { ...valid, distractorsPlausible: 'null' }), /MCQ-only/);
  assert.match(validateIndependentSolverResult(grid, { ...valid, defensibleOptionCount: 1 }), /MCQ-only/);
});
await test('solver must prove one solution and one MCQ option', () => {
  const hash = freezeMathCandidate(mcq).candidateHash;
  assert(validateIndependentSolverResult(mcq, {
    candidateHash: hash, status: 'solved', conditionsConsistent: true,
    domainMatch: true, skillMatch: true, difficultyRating: 'easy', difficultyMatch: true,
    languageUnambiguous: true, distractorsPlausible: true,
    solutionCount: 2, answer: 'C', defensibleOptionCount: 1,
  }));
});
await test('missing solver fails closed', async () => {
  const result = await independentlyValidateMathCandidate(mcq);
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /not configured/);
});
await test('blind solver result can pass', async () => {
  const result = await independentlyValidateMathCandidate(mcq, async input => ({
    candidateHash: input.candidateHash, status: 'solved', conditionsConsistent: true,
    domainMatch: true, skillMatch: true, difficultyRating: 'easy', difficultyMatch: true,
    languageUnambiguous: true, distractorsPlausible: true,
    solutionCount: 1, answer: 'C', defensibleOptionCount: 1,
    solution: 'Divide both sides by 2.', method: 'algebra',
  }));
  assert.strictEqual(result.valid, true);
});

await test('stored independent verification must match frozen candidate and answer', () => {
  const candidate = { ...mcq, validation: {} };
  candidate.validation = { candidateHash: freezeMathCandidate(candidate).candidateHash,
    status: 'independently_verified', verifiedAt: new Date().toISOString(),
    conditionsConsistent: true, domainMatch: true, skillMatch: true,
    difficultyRating: 'easy', difficultyMatch: true, languageUnambiguous: true,
    solutionCount: 1, solvedAnswer: 'C', defensibleOptionCount: 1, distractorsPlausible: true };
  assert.strictEqual(validateStoredIndependentVerification(candidate), null);
  assert(validateStoredIndependentVerification({ ...candidate, answer: 'A' }));
  const gridCandidate = { ...grid, validation: {} };
  gridCandidate.validation = { candidateHash: freezeMathCandidate(gridCandidate).candidateHash,
    status: 'independently_verified', verifiedAt: new Date().toISOString(),
    conditionsConsistent: true, domainMatch: true, skillMatch: true,
    difficultyRating: 'easy', difficultyMatch: true, languageUnambiguous: true,
    solutionCount: 1, solvedAnswer: '0.5', defensibleOptionCount: null, distractorsPlausible: null };
  assert.strictEqual(validateStoredIndependentVerification(gridCandidate), null);
  assert.match(validateStoredIndependentVerification({ ...gridCandidate,
    validation: { ...gridCandidate.validation, distractorsPlausible: 'null' } }), /null MCQ-only/);
});

await test('taxonomy, difficulty, language, and distractors fail closed', () => {
  const base={candidateHash:freezeMathCandidate(mcq).candidateHash,status:'solved',conditionsConsistent:true,
    domainMatch:true,skillMatch:true,difficultyRating:'easy',difficultyMatch:true,languageUnambiguous:true,
    solutionCount:1,answer:'C',defensibleOptionCount:1,distractorsPlausible:true,solution:'x=4',method:'algebra'};
  for(const field of ['domainMatch','skillMatch','difficultyMatch','languageUnambiguous','distractorsPlausible'])
    assert(validateIndependentSolverResult(mcq,{...base,[field]:false}),`${field} must fail`);
  assert(validateIndependentSolverResult(mcq,{...base,difficultyRating:'hard'}));
});

await test('set-level duplicate catches normalized and near-identical stems', () => {
  const original='If 2x plus 3 equals 11, what is the value of x?';
  assert(findSetLevelDuplicate('If 2x + 3 equals 11 what is the value of x', [original]));
  assert.strictEqual(findSetLevelDuplicate('A circle has radius 5. What is its area?', [original]), null);
});

console.log(`\n${passed} Math validation tests passed.`);
