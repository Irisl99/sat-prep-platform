import Question from '../models/Question.js';

export const MATH_PRODUCTION_STATUS = 'expert_approved';

export function buildMathProductionFilter(filter = {}) {
  return { ...filter, section: 'math', status: MATH_PRODUCTION_STATUS };
}

export function validateMathProductionQuestion(question) {
  if (!question || typeof question !== 'object') return 'question missing';
  if (question.section !== 'math') return 'production Math gate requires section=math';
  if (question.status !== MATH_PRODUCTION_STATUS) return 'question is not expert_approved';
  if (!question.expertId || String(question.expertId).trim() === '') return 'expertId missing';
  if (!question.expertApprovedAt || Number.isNaN(new Date(question.expertApprovedAt).getTime()))
    return 'expertApprovedAt missing or invalid';
  if (!question.candidateId || !question.candidateHash) return 'candidate provenance missing';
  if (!question.independentlyVerifiedAt || Number.isNaN(new Date(question.independentlyVerifiedAt).getTime()))
    return 'independent verification timestamp missing or invalid';
  return null;
}

// Deliberately not wired to Exam yet. Phase C establishes the production source;
// exam assembly must opt in during a separately reviewed rollout.
export async function findExpertApprovedMathQuestions(filter = {}, { limit = 0, QuestionModel = Question } = {}) {
  let query = QuestionModel.find(buildMathProductionFilter(filter));
  if (limit > 0) query = query.limit(limit);
  const questions = await query.lean();
  const invalid = questions.map(question => ({ question, reason: validateMathProductionQuestion(question) }))
    .filter(entry => entry.reason);
  if (invalid.length > 0) {
    const error = new Error(`Math production gate rejected ${invalid.length} invalid record(s)`);
    error.code = 'MATH_PRODUCTION_GATE_REJECTED';
    error.invalid = invalid;
    throw error;
  }
  return questions;
}
