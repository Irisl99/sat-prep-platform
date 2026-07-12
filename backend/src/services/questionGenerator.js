import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPTS = {
  rw: (difficulty, count) => `Generate exactly ${count} Digital SAT Reading and Writing questions.
Difficulty: ${diffDesc(difficulty)}
Include: craft and structure (30%), information and ideas (30%), expression of ideas (25%), standard English conventions (15%).
Each question must include a short passage (30–80 words) from literature, history, science, or social science.
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"rw","type":"mcq","difficulty":"easy"|"medium"|"hard","topic":"string","passage":"string","passageSource":"string","question":"string","options":["A text","B text","C text","D text"],"answer":"A"|"B"|"C"|"D","explanation":"string" }]`,

  math: (difficulty, count) => `Generate exactly ${count} Digital SAT Math questions.
Difficulty: ${diffDesc(difficulty)}
Include: algebra (35%), advanced math (35%), problem-solving & data analysis (15%), geometry & trig (15%).
About 75% MCQ, 25% grid-in (student-produced response, type:"grid", options:null).
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"math","type":"mcq"|"grid","difficulty":"easy"|"medium"|"hard","topic":"string","question":"string","options":["A text","B text","C text","D text"]|null,"answer":"A"|"B"|"C"|"D"|"<number_string>","explanation":"string" }]`,
};

function diffDesc(d) {
  return {
    mixed: 'a mix of easy (40%), medium (40%), hard (20%)',
    easy:  'easy and medium difficulty (score range 200–550)',
    hard:  'medium and hard difficulty (score range 550–800)',
  }[d];
}

/**
 * Generate SAT questions via Claude.
 * @param {'rw'|'math'} section
 * @param {'mixed'|'easy'|'hard'} difficulty
 * @param {number} count
 * @returns {Promise<Object[]>}
 */
export async function generateQuestions(section, difficulty, count) {
  const prompt = PROMPTS[section](difficulty, count);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  return parsed.slice(0, count).map((q, i) => ({
    ...q,
    _idx: i,
  }));
}

/**
 * Generate a weakness analysis report from completed exam modules.
 * Returns structured domain-level breakdown for premium users.
 */
export async function generateWeaknessReport(modules) {
  const summary = modules.map(m => ({
    moduleId: m.moduleId,
    section: m.section,
    difficulty: m.difficulty,
    questions: m.questions.map((q, i) => ({
      topic: q.topic,
      difficulty: q.difficulty,
      correct: String(m.answers?.[i]) === String(q.answer),
    })),
  }));

  const prompt = `Given this SAT exam performance data, generate a detailed weakness analysis report.
Data: ${JSON.stringify(summary)}
Return ONLY a JSON object (no markdown) with this schema:
{
  "domains": [
    {
      "name": "Domain name",
      "section": "rw"|"math",
      "correct": number,
      "total": number,
      "accuracy": number,
      "status": "strong"|"good"|"needs_work"|"critical",
      "subTopics": ["specific topic that was missed"],
      "insight": "1-2 sentence actionable insight"
    }
  ],
  "flags": [
    {
      "title": "Short title",
      "description": "2-3 sentence explanation of what went wrong and why it matters",
      "priority": "high"|"medium"|"low",
      "section": "rw"|"math",
      "errorCount": number
    }
  ],
  "recommendations": [
    "Specific, actionable study recommendation"
  ],
  "summary": "2-3 sentence overall performance summary"
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
