import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REVIEW_DIR = join(__dirname, '..', 'data', 'math-reviews');

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] || null;
}

export function buildKeepReviewBatch(batch, reviewer, reviewedAt = new Date().toISOString()) {
  if (!batch || !Array.isArray(batch.candidates) || batch.candidates.length !== 1)
    throw new Error('expert review creation requires exactly one candidate');
  if (!reviewer || reviewer.trim() === '') throw new Error('reviewer is required');
  return {
    ...batch,
    candidates: batch.candidates.map(candidate => ({
      ...candidate,
      review: {
        decision: 'Keep', correctAnswer: true, uniqueAnswer: true, conditionsConsistent: true,
        explanationCorrect: true, skillTagCorrect: true, difficultyCorrect: true,
        reviewer: reviewer.trim(), reviewerRole: 'math_expert', expertAttestation: true,
        reviewedAt, reviewerNotes: 'Expert reviewed: no issues; difficulty confirmed.',
        reviewedContent: null,
      },
    })),
  };
}

export function writeReviewFile(batch, sourcePath, outputDir = DEFAULT_REVIEW_DIR) {
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `review_${basename(sourcePath)}`);
  const tempPath = `${outputPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(batch, null, 2), 'utf8');
  renameSync(tempPath, outputPath);
  return outputPath;
}

export async function main() {
  const args = process.argv.slice(2);
  const sourcePath = valueAfter(args, '--file');
  const reviewer = valueAfter(args, '--reviewer');
  if (!sourcePath || !existsSync(sourcePath)) throw new Error('--file must reference an existing candidate file');
  if (!args.includes('--keep-all')) throw new Error('explicit --keep-all confirmation is required');
  if (!args.includes('--expert-attestation')) throw new Error('explicit --expert-attestation confirmation is required');
  const batch = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const reviewed = buildKeepReviewBatch(batch, reviewer);
  const outputPath = writeReviewFile(reviewed, sourcePath, process.env.MATH_REVIEW_DIR || DEFAULT_REVIEW_DIR);
  console.log(`[review] Written: ${outputPath}`);
}

const isDirectExecution = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main().catch(error => { console.error(`[createMathExpertReview] ${error.message}`); process.exit(1); });
