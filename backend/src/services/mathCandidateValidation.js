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
  if (!Number.isInteger(solverResult.solutionCount) || solverResult.solutionCount !== 1)
    return `candidate must have exactly one solution, got ${solverResult.solutionCount ?? 'unverified'}`;
  if (!answersEquivalent(candidate.type, candidate.answer, solverResult.answer))
    return 'stored answer disagrees with independent solver';
  if (candidate.type === 'mcq' && solverResult.defensibleOptionCount !== 1)
    return `MCQ must have exactly one defensible option, got ${solverResult.defensibleOptionCount ?? 'unverified'}`;
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
  if (proof.solutionCount !== 1) return 'exactly one solution was not independently verified';
  if (!answersEquivalent(candidate.type, candidate.answer, proof.solvedAnswer))
    return 'stored answer does not match independently solved answer';
  if (candidate.type === 'mcq' && proof.defensibleOptionCount !== 1)
    return 'exactly one defensible MCQ option was not independently verified';
  if (!proof.verifiedAt || Number.isNaN(Date.parse(proof.verifiedAt)))
    return 'independent verification timestamp missing or invalid';
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
