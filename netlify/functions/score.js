// POST /api/score  { track, sub, n, prompt }
// Runs the rubric against an attempt and returns the result. The
// patterns stay on this side; what comes back is the verdict plus the
// teaching material that only makes sense once you have tried.

const { loadRubric, scoreText } = require('./lib/rubric');
const { judge } = require('./lib/judge');

const MAX_PROMPT = 20000;   // generous for a prompt, bounded against abuse

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Malformed JSON' }) }; }

  const prompt = String(body.prompt || '');
  if (prompt.length > MAX_PROMPT) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: 'Prompt too long' }) };
  }

  const rubric = loadRubric(body.track, body.sub, body.n);
  if (!rubric) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'No such level' }) };
  }

  // The judge reads the attempt and must quote the learner's own words
  // for every point it awards. It resolves to null whenever it cannot be
  // trusted or reached — no API key, a failed call, an answer that did
  // not cover every criterion — and scoring falls back to the regex
  // rubric, which the response labels so nobody is told a pattern match
  // was a reading.
  let verdicts = null;
  try { verdicts = await judge(prompt, rubric); }
  catch (e) { console.warn('[score] judge threw, falling back to the rubric:', e.message); }

  const result = scoreText(prompt, rubric, verdicts);

  // Released only after an attempt. Seeing the reference answer once you
  // have written your own is the lesson; seeing it beforehand is the
  // answer key, which is exactly what this move was for.
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ...result,
      badOutput: rubric.badOutput,
      tipIfLow: rubric.tipIfLow,
      goldPrompt: rubric.goldPrompt
    })
  };
};
