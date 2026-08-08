const DEFAULT_MODEL = 'claude-sonnet-4-6';

function extractText(message) {
  return (message?.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
}

export function parseStrictJsonObject(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('model response must be one JSON object');
  return parsed;
}

export function buildMathQuestionPrompt(slot, count) {
  const typeRules = slot.type === 'mcq'
    ? 'Provide exactly four unique options and set answer to exactly A, B, C, or D.'
    : 'Set options to null and answer to a finite decimal, integer, or fraction.';
  return `Generate exactly ${count} original Digital SAT Math candidate question(s).
Domain: ${slot.domain}
Skill: ${slot.skill}
Difficulty: ${slot.difficulty}
Type: ${slot.type}

The problem statement is immutable after generation. If any condition is contradictory, ambiguous, insufficient, or produces zero or multiple answers, discard it and generate a different candidate. Never repair or reinterpret a flawed problem. Do not use calculus, derivatives, integrals, or limits.
${typeRules}
For MCQ, each wrong option must represent a plausible student error and exactly one option may be defensible.
Do not produce an explanation. Explanations are generated only after an independent blind solution is verified.
Return only a JSON array with this schema:
[{"section":"math","domain":"${slot.domain}","skill":"${slot.skill}","difficulty":"${slot.difficulty}","type":"${slot.type}","question":"string","options":${slot.type === 'mcq' ? '["string","string","string","string"]' : 'null'},"answer":"string"}]`;
}

async function callJson(client, prompt, model = DEFAULT_MODEL) {
  const message = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'max_tokens') throw new Error('model response was truncated');
  return parseStrictJsonObject(extractText(message));
}

export function createAnthropicBlindSolver(client, { model = DEFAULT_MODEL } = {}) {
  return async blindInput => callJson(client, `You are an independent Digital SAT Math validator.
You receive a frozen problem without the generator's intended answer or explanation. The statement is immutable.
Never change numbers, add assumptions, reinterpret conditions, or solve an "intended" version. If it is inconsistent, ambiguous, underspecified, out of SAT scope, or does not have exactly one answer, return status "rejected".
Solve from scratch. For MCQ, evaluate all four options and count how many are defensible.
Return only one JSON object with exactly these fields:
{"candidateHash":"${blindInput.candidateHash}","status":"solved|rejected","conditionsConsistent":true,"solutionCount":1,"answer":"A|B|C|D|numeric string","defensibleOptionCount":1,"method":"short method name","solution":"concise verified solution"}
Use null for answer, solutionCount, or defensibleOptionCount when they cannot be established.

FROZEN PROBLEM:
${JSON.stringify(blindInput)}`, model);
}

export function createAnthropicVerifiedExplainer(client, { model = DEFAULT_MODEL } = {}) {
  return async ({ candidate, solverResult }) => {
    const result = await callJson(client, `Write a concise student-facing explanation for a Digital SAT Math question whose independent solution has already been verified.
Use only the frozen question and verified solution below. Do not mention generation, validation, self-correction, hidden reasoning, or an intended version. Do not change or add conditions. Do not use calculus.
Return only: {"explanation":"string"}

FROZEN QUESTION:
${JSON.stringify({ question: candidate.question, options: candidate.options, type: candidate.type })}
VERIFIED ANSWER AND SOLUTION:
${JSON.stringify({ answer: solverResult.answer, method: solverResult.method, solution: solverResult.solution })}`, model);
    if (typeof result.explanation !== 'string' || result.explanation.trim() === '')
      throw new Error('verified explainer returned no explanation');
    return result.explanation.trim();
  };
}

export { DEFAULT_MODEL };
