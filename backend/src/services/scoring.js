/**
 * SAT Adaptive Scoring Service
 * Approximates College Board's IRT-based score conversion.
 *
 * Real SAT: 200–800 per section (400–1600 total)
 * Hard module routing adds ~40pt ceiling bonus.
 */

const SCALE = Array.from({ length: 61 }, (_, i) => 200 + i * 10); // 200–800 in steps of 10

/**
 * Calculate section score from one or more completed modules.
 * @param {Array} moduleResults  - array of { questions, answers, difficulty }
 * @param {boolean} hardModuleRouted - whether the stage-2 module was Hard
 */
export function calcSectionScore(moduleResults, hardModuleRouted) {
  let weightedCorrect = 0;
  let total = 0;

  for (const mod of moduleResults) {
    for (let i = 0; i < mod.questions.length; i++) {
      const q = mod.questions[i];
      const ans = mod.answers?.[i];
      const correct = isCorrect(ans, q);
      total++;
      if (correct) {
        const w = diffWeight(q.difficulty);
        weightedCorrect += w;
      }
    }
  }

  const rawRatio = total > 0 ? weightedCorrect / (total * diffWeight('medium')) : 0;
  const scaleIdx = Math.min(Math.round(rawRatio * 60), 60);
  const base = SCALE[scaleIdx];
  const bonus = hardModuleRouted ? 40 : 0;

  return Math.min(800, Math.max(200, base + bonus));
}

/**
 * Determine adaptive routing: did Module 1 score warrant Hard Module 2?
 * Threshold: ≥55% correct on Module 1.
 */
export function shouldRouteHard(module1Result) {
  const { questions, answers } = module1Result;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (isCorrect(answers?.[i], questions[i])) correct++;
  }
  return correct / questions.length >= 0.55;
}

/**
 * Compute per-question correctness stats for a full exam (for weakness report).
 */
export function computeStats(modules) {
  const byDomain = {};
  for (const mod of modules) {
    for (let i = 0; i < mod.questions.length; i++) {
      const q = mod.questions[i];
      const correct = isCorrect(mod.answers?.[i], q);
      const key = q.topic || `${q.section}-unknown`;
      if (!byDomain[key]) byDomain[key] = { correct: 0, total: 0 };
      byDomain[key].total++;
      if (correct) byDomain[key].correct++;
    }
  }
  return byDomain;
}

function isCorrect(answer, question) {
  if (!answer) return false;
  if (question.type === 'grid') return String(answer).trim() === String(question.answer).trim();
  return answer === question.answer;
}

function diffWeight(diff) {
  return { easy: 0.7, medium: 1.0, hard: 1.4 }[diff] ?? 1.0;
}
