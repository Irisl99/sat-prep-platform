import { generateAndValidateQuestions } from './questionGenerator.js';

export async function getModuleQuestions(section, difficulty, count, moduleId) {
  console.log(`[questionSource] section=${section} difficulty=${difficulty} count=${count} moduleId=${moduleId} source=LIVE_GENERATION`);
  const { questions, rejections } = await generateAndValidateQuestions(section, difficulty, count);
  if (rejections.length > 0) {
    console.warn(`[questionSource] moduleId=${moduleId} rejected=${rejections.length} accepted=${questions.length}/${count}`);
  }
  if (questions.length < count) {
    throw new Error(`Insufficient valid questions: need ${count}, got ${questions.length} (section=${section}, moduleId=${moduleId}). ${rejections.length} candidate(s) failed structural validation.`);
  }
  return questions.slice(0, count);
}
