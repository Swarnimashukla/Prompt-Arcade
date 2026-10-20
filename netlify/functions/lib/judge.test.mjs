// Tests for the part of the judge that cannot be allowed to be wrong:
// quote verification, and the scoring that depends on it.
//
// The model's own judgement is not tested here — it needs the network and
// it is not deterministic. What is tested is the guarantee around it: a
// point is awarded only when the quoted evidence is genuinely present in
// the learner's submission, and the regex path still behaves exactly as
// it did before the judge existed.
//
//   node netlify/functions/lib/judge.test.mjs

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const { verifyQuote, normalize, criteriaFor, gradeFromResponse } = require(join(here, 'judge.js'));
const { scoreText } = require(join(here, 'rubric.js'));

let failures = 0;

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures += 1;
    console.error(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

// ---------------------------------------------------------------------
// Quote verification
// ---------------------------------------------------------------------

const SUBMISSION = [
  'You are a senior PM partner at Flipkart. Returns on women’s ethnic wear',
  'jumped 22% to 41% in the 10 days after Big Billion Days.',
  'Rank five hypotheses by likelihood. Do NOT propose redesigns.'
].join('\n');

const NORM = normalize(SUBMISSION);

const text = q => verifyQuote(q, NORM);

check('verbatim clause passes',
  text('Rank five hypotheses by likelihood'), 'Rank five hypotheses by likelihood');

check('case and whitespace differences are forgiven',
  text('rank   five\nhypotheses  BY likelihood'), 'rank   five\nhypotheses  BY likelihood');

check('a straight apostrophe matches the curly one in the text',
  text("Returns on women's ethnic wear"), "Returns on women's ethnic wear");

check('a paraphrase is refused',
  text('Rank the five hypotheses in order of how likely they are'), null);

// This is the case the whole design exists for: evidence from the
// scenario rather than from what the learner wrote.
check('a quote from somewhere other than the submission is refused',
  text('return-reason tags and warehouse photos'), null);

// And this is the other one: a keyword offered as if it were evidence.
check('a single keyword is not evidence', text('Rank'), null);
check('two words are not evidence', text('Rank five'), null);
check('three words are', text('Rank five hypotheses'), 'Rank five hypotheses');

check('an empty quote is refused', text(''), null);
check('whitespace is refused', text('   \n '), null);
check('null is refused', text(null), null);

check('an absurdly long quote is refused', text('x'.repeat(401)), null);

// A fragment that spans the line break: real, so it should pass, and it
// exercises the whitespace collapsing.
check('evidence spanning a line break passes',
  text('ethnic wear\njumped 22% to 41%'), 'ethnic wear\njumped 22% to 41%');

// ---------------------------------------------------------------------
// Criteria construction
// ---------------------------------------------------------------------

const rubric = {
  id: 'test-1',
  tokenBudget: 300,
  badPrompt: 'why are returns up',
  dimensions: [
    { key: 'clarity', label: 'Clarity', checks: [
      { pattern: 'diagnose|hypothesis', tip: 'State the diagnostic intent.' },
      { pattern: 'return|fashion', tip: 'Name the specific metric.' }
    ] },
    { key: 'goal', label: 'Goal alignment', checks: [
      { pattern: 'rank|priorit', tip: 'Ask for a ranking.' },
      { pattern: 'leadership|exec', tip: 'Reference the audience.' }
    ] }
  ]
};

check('one criterion per check, plus responsibility',
  criteriaFor(rubric).map(c => c.id),
  ['clarity:0', 'clarity:1', 'goal:0', 'goal:1', 'responsibility']);

// ---------------------------------------------------------------------
// Grading a model response
// ---------------------------------------------------------------------

const CRIT = criteriaFor(rubric);
const ids = ['clarity:0', 'clarity:1', 'goal:0', 'goal:1', 'responsibility'];

// A response where every claim is backed by a real span.
const honest = gradeFromResponse({
  criteria: [
    { id: 'clarity:0', pass: true,  quote: 'Rank five hypotheses by likelihood' },
    { id: 'clarity:1', pass: true,  quote: 'Returns on women’s ethnic wear' },
    { id: 'goal:0',    pass: false, quote: '' },
    { id: 'goal:1',    pass: false, quote: '' },
    { id: 'responsibility', pass: true, quote: 'Do NOT propose redesigns' }
  ]
}, SUBMISSION, CRIT);

check('honest evidence is accepted',
  ids.map(id => honest.verdicts[id].passed), [true, true, false, false, true]);
check('honest evidence rejects nothing', honest.evidenceRejected, 0);
check('the accepted quote is kept as the learner wrote it',
  honest.verdicts['responsibility'].quote, 'Do NOT propose redesigns');

// The failure this design exists to catch: a judge that awards a point
// and invents the evidence. The claim is refused, not the response.
const hallucinating = gradeFromResponse({
  criteria: [
    { id: 'clarity:0', pass: true, quote: 'Rank five hypotheses by likelihood' },
    { id: 'clarity:1', pass: true, quote: 'break the findings down by pincode and age band' },
    { id: 'goal:0',    pass: true, quote: 'present this to the category leadership team' },
    { id: 'goal:1',    pass: false, quote: '' },
    { id: 'responsibility', pass: true, quote: 'cite every claim against the source data' }
  ]
}, SUBMISSION, CRIT);

check('invented evidence does not score',
  ids.map(id => hallucinating.verdicts[id].passed), [true, false, false, false, false]);
check('invented evidence is counted', hallucinating.evidenceRejected, 3);

// A pass whose only evidence is a keyword. Three claims, three keywords,
// no points — this is the keyword-stuffing defence at the quote layer.
const keywords = gradeFromResponse({
  criteria: [
    { id: 'clarity:0', pass: true, quote: 'Rank' },
    { id: 'clarity:1', pass: true, quote: 'Returns' },
    { id: 'goal:0',    pass: true, quote: '41%' },
    { id: 'goal:1',    pass: false, quote: '' },
    { id: 'responsibility', pass: true, quote: 'NOT' }
  ]
}, SUBMISSION, CRIT);

check('keywords offered as evidence score nothing',
  ids.map(id => keywords.verdicts[id].passed), [false, false, false, false, false]);
check('every keyword claim is counted as rejected', keywords.evidenceRejected, 4);

// An incomplete read is not downgraded into a bad score; it is refused,
// so scoring falls back to the rubric rather than failing the learner
// on criteria nobody looked at.
check('a partial answer is refused outright',
  gradeFromResponse({ criteria: [{ id: 'clarity:0', pass: true, quote: 'Rank five hypotheses' }] },
    SUBMISSION, CRIT), null);

check('a malformed response is refused', gradeFromResponse({}, SUBMISSION, CRIT), null);
check('a null response is refused', gradeFromResponse(null, SUBMISSION, CRIT), null);

// Duplicate ids: first answer wins, and the criterion still counts as
// answered. A second contradicting entry cannot overwrite the first.
const dupes = gradeFromResponse({
  criteria: [
    { id: 'clarity:0', pass: true,  quote: 'Rank five hypotheses by likelihood' },
    { id: 'clarity:0', pass: false, quote: '' },
    { id: 'clarity:1', pass: false, quote: '' },
    { id: 'goal:0',    pass: false, quote: '' },
    { id: 'goal:1',    pass: false, quote: '' },
    { id: 'responsibility', pass: false, quote: '' }
  ]
}, SUBMISSION, CRIT);
check('a duplicate id cannot overwrite the first answer',
  dupes && dupes.verdicts['clarity:0'].passed, true);

// ---------------------------------------------------------------------
// Scoring on the judge path
// ---------------------------------------------------------------------

// Note what is being asserted: the verdicts handed to scoreText are the
// VERIFIED ones, so a claimed pass whose quote failed verification has
// already become { passed: false } by the time it arrives. What this
// checks is that scoreText honours them instead of re-running the regex.
const judged = scoreText('Rank five hypotheses by likelihood for leadership.', rubric, {
  verdicts: {
    'clarity:0': { passed: false, quote: null },
    'clarity:1': { passed: false, quote: null },
    'goal:0':    { passed: true,  quote: 'Rank five hypotheses by likelihood' },
    'goal:1':    { passed: true,  quote: 'for leadership' },
    'responsibility': { passed: false, quote: null }
  },
  model: 'test-model',
  evidenceRejected: 1
});

check('judged dimensions use the verdicts, not the patterns',
  judged.dimensions.map(d => `${d.key} ${d.pts}/${d.max}`),
  ['clarity 0/2', 'goal 2/2']);

check('evidence is the quoted spans for passed checks only',
  judged.dimensions.map(d => d.evidence),
  [[], ['Rank five hypotheses by likelihood', 'for leadership']]);

check('tips still come back for failed checks only',
  judged.dimensions.map(d => d.tips.length), [2, 0]);

check('score is the same arithmetic as before', judged.score, 5);
check('the engine is labelled', judged.engine, 'judge');
check('the model is reported', judged.judgeModel, 'test-model');
check('rejected evidence is reported', judged.evidenceRejected, 1);
check('responsibility comes from the judge, not the regex', judged.responsibilityCue, false);

// The regex would have passed 'clarity:1' on "returns" and 'goal:0' on
// "rank". If the judge's verdicts were being ignored, clarity would be
// 1/2 rather than 0/2 — which is what the assertion above pins down.

// A judge verdict of "responsibility passed" must lift the tier, since
// that is the gate between Sharp and Surgical.
const surgical = scoreText('Rank five hypotheses. Do not guess; flag uncertainty.', rubric, {
  verdicts: {
    'clarity:0': { passed: true, quote: 'a' }, 'clarity:1': { passed: true, quote: 'b' },
    'goal:0': { passed: true, quote: 'c' },    'goal:1': { passed: true, quote: 'd' },
    'responsibility': { passed: true, quote: 'flag uncertainty' }
  },
  model: 'test-model', evidenceRejected: 0
});
check('a full pass with a verified guardrail reaches Surgical', surgical.tier.name, 'Surgical');

// ---------------------------------------------------------------------
// The regex path must be untouched
// ---------------------------------------------------------------------

const fallback = scoreText('Diagnose why returns are up. Rank by priority for the exec team.', rubric);

check('the regex path still scores', fallback.dimensions.map(d => `${d.key} ${d.pts}/${d.max}`),
  ['clarity 2/2', 'goal 2/2']);
check('the regex path is labelled as the rubric', fallback.engine, 'rubric');
check('the regex path carries no evidence', fallback.dimensions.map(d => d.evidence), [[], []]);
check('the regex path reports no model', fallback.judgeModel, null);

// An attempt scored with no verdicts argument at all behaves exactly as
// it did before this change — the same call the old code made.
check('omitting verdicts is the same as passing null',
  JSON.stringify(scoreText('Diagnose returns, rank for exec.', rubric, null)),
  JSON.stringify(scoreText('Diagnose returns, rank for exec.', rubric)));

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
