import { createHash } from 'crypto';

const SAT_SCOPE_BLOCKERS = [
  { label: 'calculus', pattern: /\bcalculus\b/i },
  { label: 'derivative', pattern: /\bderivat(?:ive|ives|ion)\b|\bd\s*\/\s*dx\b/i },
  { label: 'integral', pattern: /\bintegr(?:al|als|ate|ation)\b|[∫]/i },
  { label: 'limit', pattern: /\blimit\s+(?:as|of)\b|\blim\s*[_({]/i },
];

const FROZEN_FIELDS = [
  'section', 'domain', 'skill', 'difficulty', 'type', 'question', 'options',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function freezeMathCandidate(candidate) {
  const content = Object.fromEntries(FROZEN_FIELDS.map(field => [field, candidate[field]]));
  const canonical = JSON.stringify(canonicalize(content));
  return Object.freeze({
    ...JSON.parse(canonical),
    candidateHash: createHash('sha256').update(canonical).digest('hex'),
  });
}

export function hashMathExplanation(explanation) {
  return createHash('sha256').update(String(explanation || '').trim()).digest('hex');
}

export function findExplanationPolicyViolation(candidate, explanation) {
  const text = String(explanation || '');
  if (/why\s+(?:the\s+)?other\s+(?:choices|options)|distractor/i.test(text))
    return 'explanation must not discuss incorrect options or distractors';
  if (candidate?.type === 'mcq') {
    const correct = String(candidate.answer || '').trim().toUpperCase();
    for (const label of ['A','B','C','D'].filter(value => value !== correct)) {
      if (new RegExp(`(?:^|\\s|\\*)${label}\\s*[).:]`, 'm').test(text))
        return `explanation mentions incorrect option ${label}`;
    }
  }
  return null;
}

export function createBlindSolverInput(candidate) {
  const frozen = freezeMathCandidate(candidate);
  return {
    section: frozen.section,
    domain: frozen.domain,
    skill: frozen.skill,
    difficulty: frozen.difficulty,
    type: frozen.type,
    question: frozen.question,
    options: frozen.options,
    candidateHash: frozen.candidateHash,
  };
}

export function findSatScopeViolation(...texts) {
  const combined = texts.filter(value => typeof value === 'string').join('\n');
  for (const blocker of SAT_SCOPE_BLOCKERS) {
    if (blocker.pattern.test(combined)) return blocker.label;
  }
  return null;
}

export function parseSatNumericAnswer(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const fraction = text.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

export function answersEquivalent(type, storedAnswer, solvedAnswer, tolerance = 1e-9) {
  if (type === 'mcq') {
    return String(storedAnswer).trim().toUpperCase() ===
      String(solvedAnswer).trim().toUpperCase();
  }
  const stored = parseSatNumericAnswer(storedAnswer);
  const solved = parseSatNumericAnswer(solvedAnswer);
  return stored !== null && solved !== null && Math.abs(stored - solved) <= tolerance;
}

export function normalizeMathQuestionText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findSetLevelDuplicate(question, previousQuestions, threshold = 0.85) {
  const normalized = normalizeMathQuestionText(question);
  if (!normalized) return null;
  const tokens = new Set(normalized.split(' '));
  for (const previous of previousQuestions) {
    const prior = normalizeMathQuestionText(previous);
    if (normalized === prior) return { previous, similarity: 1 };
    const priorTokens = new Set(prior.split(' '));
    if (tokens.size < 6 || priorTokens.size < 6) continue;
    const intersection = [...tokens].filter(token => priorTokens.has(token)).length;
    const union = new Set([...tokens, ...priorTokens]).size;
    const similarity = union === 0 ? 0 : intersection / union;
    if (similarity >= threshold) return { previous, similarity };
  }
  return null;
}

export function validateTypeSpecificAnswer(candidate) {
  if (candidate.type === 'mcq') {
    if (!Array.isArray(candidate.options) || candidate.options.length !== 4)
      return 'MCQ must have exactly four options';
    const normalized = candidate.options.map(option => String(option).trim().toLowerCase());
    if (normalized.some(option => option === '')) return 'MCQ options must be non-empty';
    if (new Set(normalized).size !== 4) return 'MCQ options must be unique';
    if (!['A', 'B', 'C', 'D'].includes(String(candidate.answer).trim().toUpperCase()))
      return 'MCQ answer must be A, B, C, or D';
    return null;
  }
  if (candidate.type === 'grid') {
    if (candidate.options !== null && candidate.options !== undefined)
      return 'SPR must have options=null';
    if (parseSatNumericAnswer(candidate.answer) === null)
      return 'SPR answer must be a finite number or fraction';
    return null;
  }
  return `unsupported Math question type: ${candidate.type}`;
}

export function validateIndependentSolverResult(candidate, solverResult) {
  if (!solverResult || typeof solverResult !== 'object') return 'independent solver returned no result';
  if (solverResult.candidateHash !== freezeMathCandidate(candidate).candidateHash)
    return 'independent solver result does not match frozen candidate';
  if (solverResult.status !== 'solved')
    return `independent solver status must be solved, got ${solverResult.status || 'missing'}`;
  if (solverResult.conditionsConsistent !== true) return 'candidate conditions are inconsistent or unverified';
  if (solverResult.domainMatch !== true) return 'candidate does not match the requested domain';
  if (solverResult.skillMatch !== true) return 'candidate does not match the requested skill';
  if (solverResult.difficultyMatch !== true || solverResult.difficultyRating !== candidate.difficulty)
    return `candidate difficulty is unverified or mismatched: ${solverResult.difficultyRating || 'missing'}`;
  if (solverResult.languageUnambiguous !== true) return 'question language is ambiguous or unverified';
  if (!Number.isInteger(solverResult.solutionCount) || solverResult.solutionCount !== 1)
    return `candidate must have exactly one solution, got ${solverResult.solutionCount ?? 'unverified'}`;
  if (!answersEquivalent(candidate.type, candidate.answer, solverResult.answer))
    return 'stored answer disagrees with independent solver';
  if (candidate.type === 'mcq' && solverResult.defensibleOptionCount !== 1)
    return `MCQ must have exactly one defensible option, got ${solverResult.defensibleOptionCount ?? 'unverified'}`;
  if (candidate.type === 'mcq' && solverResult.distractorsPlausible !== true)
    return 'MCQ distractors are implausible or unverified';
  if (candidate.type === 'grid' &&
      (solverResult.defensibleOptionCount !== null || solverResult.distractorsPlausible !== null))
    return 'SPR solver must return null for MCQ-only validation fields';
  if (typeof solverResult.method !== 'string' || solverResult.method.trim() === '' ||
      typeof solverResult.solution !== 'string' || solverResult.solution.trim() === '')
    return 'independent solver method or solution is missing';
  const scopeViolation = findSatScopeViolation(candidate.question, solverResult.solution, solverResult.method);
  if (scopeViolation) return `SAT scope violation: ${scopeViolation}`;
  return null;
}

export function validateStoredIndependentVerification(candidate) {
  const proof = candidate.validation;
  if (!proof || typeof proof !== 'object') return 'independent verification evidence missing';
  if (proof.status !== 'independently_verified') return 'candidate is not independently verified';
  if (proof.candidateHash !== freezeMathCandidate(candidate).candidateHash)
    return 'independent verification does not match frozen candidate';
  if (proof.conditionsConsistent !== true) return 'conditions were not independently verified';
  if (proof.domainMatch !== true || proof.skillMatch !== true) return 'domain or skill was not independently verified';
  if (proof.difficultyMatch !== true || proof.difficultyRating !== candidate.difficulty)
    return 'difficulty was not independently verified';
  if (proof.languageUnambiguous !== true) return 'language semantics were not independently verified';
  if (proof.solutionCount !== 1) return 'exactly one solution was not independently verified';
  if (!answersEquivalent(candidate.type, candidate.answer, proof.solvedAnswer))
    return 'stored answer does not match independently solved answer';
  if (candidate.type === 'mcq' && proof.defensibleOptionCount !== 1)
    return 'exactly one defensible MCQ option was not independently verified';
  if (candidate.type === 'mcq' && proof.distractorsPlausible !== true)
    return 'MCQ distractors were not independently verified';
  if (candidate.type === 'grid' &&
      (proof.defensibleOptionCount !== null || proof.distractorsPlausible !== null))
    return 'SPR verification must contain null MCQ-only fields';
  if (!proof.verifiedAt || Number.isNaN(Date.parse(proof.verifiedAt)))
    return 'independent verification timestamp missing or invalid';
  if (proof.explanationStatus !== 'independently_verified')
    return 'independent explanation verification evidence missing';
  if (proof.explanationHash !== hashMathExplanation(candidate.explanation))
    return 'independent explanation verification does not match stored explanation';
  if (proof.explanationPolicyCompliant !== true || findExplanationPolicyViolation(candidate, candidate.explanation))
    return 'stored explanation violates the no-distractor-discussion policy';
  if (!proof.explanationVerifiedAt || Number.isNaN(Date.parse(proof.explanationVerifiedAt)))
    return 'independent explanation verification timestamp missing or invalid';
  if (proof.explanationReasoningCorrect !== true || proof.explanationAnswerConsistent !== true ||
      proof.explanationNoAddedAssumptions !== true || proof.explanationLanguageClear !== true ||
      proof.explanationSatScopeCompliant !== true)
    return 'stored explanation was not independently verified';
  return null;
}

export function validateExplanationVerifierResult(candidate, explanation, result) {
  if (!result || typeof result !== 'object') return 'explanation verifier returned no result';
  if (result.candidateHash !== freezeMathCandidate(candidate).candidateHash)
    return 'explanation verifier result does not match frozen candidate';
  if (result.explanationHash !== hashMathExplanation(explanation))
    return 'explanation verifier result does not match generated explanation';
  if (result.status !== 'verified') return `explanation verifier rejected: ${result.reason || 'unspecified reason'}`;
  if (result.reasoningCorrect !== true) return 'explanation contains incorrect mathematical reasoning';
  if (result.answerConsistent !== true) return 'explanation answer is inconsistent with the verified answer';
  if (result.noAddedAssumptions !== true) return 'explanation adds or changes problem conditions';
  if (result.languageClear !== true) return 'explanation language is ambiguous or unclear';
  if (result.satScopeCompliant !== true) return 'explanation uses methods outside SAT scope';
  return null;
}

export async function independentlyValidateMathCandidate(candidate, solveBlind) {
  const formatError = validateTypeSpecificAnswer(candidate);
  if (formatError) return { valid: false, reason: formatError };
  const scopeViolation = findSatScopeViolation(candidate.question);
  if (scopeViolation) return { valid: false, reason: `SAT scope violation: ${scopeViolation}` };
  if (typeof solveBlind !== 'function')
    return { valid: false, reason: 'independent solver is not configured' };
  const solverResult = await solveBlind(createBlindSolverInput(candidate));
  const solverError = validateIndependentSolverResult(candidate, solverResult);
  return solverError
    ? { valid: false, reason: solverError, solverResult }
    : { valid: true, solverResult };
}

export { SAT_SCOPE_BLOCKERS };
