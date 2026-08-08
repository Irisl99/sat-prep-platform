import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildKeepReviewBatch, writeReviewFile } from '../scripts/createMathExpertReview.mjs';

const candidate={candidateId:'c1',review:{decision:null},validation:{status:'independently_verified'}};
const batch={generatorVersion:'v1',slot:{section:'math'},candidates:[candidate],rejected:[]};
const reviewedAt='2026-08-08T20:00:00.000Z';
const reviewed=buildKeepReviewBatch(batch,'Chen',reviewedAt);
const review=reviewed.candidates[0].review;
assert.strictEqual(review.decision,'Keep');
assert.strictEqual(review.reviewer,'Chen');
assert.strictEqual(review.reviewerRole,'math_expert');
assert.strictEqual(review.expertAttestation,true);
for(const field of ['correctAnswer','uniqueAnswer','conditionsConsistent','explanationCorrect','skillTagCorrect','difficultyCorrect'])
  assert.strictEqual(review[field],true);
assert.strictEqual(review.reviewedAt,reviewedAt);
assert.strictEqual(candidate.review.decision,null);
assert.throws(()=>buildKeepReviewBatch({...batch,candidates:[]},'Chen'),/exactly one/);
assert.throws(()=>buildKeepReviewBatch(batch,''),/reviewer/);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-review-'));
const output=writeReviewFile(reviewed,'candidate.json',dir);
assert.strictEqual(path.basename(output),'review_candidate.json');
assert.strictEqual(JSON.parse(fs.readFileSync(output,'utf8')).candidates[0].review.reviewer,'Chen');
assert.strictEqual(fs.readdirSync(dir).filter(file=>file.endsWith('.tmp')).length,0);
fs.rmSync(dir,{recursive:true});
console.log('=== RESULTS: 1/1 Math expert review creator passed ===');
