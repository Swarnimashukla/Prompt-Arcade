// POST /api/score  { track, sub, n, prompt }
// Runs the rubric against an attempt and returns the result. The
// patterns stay on this side; what comes back is the verdict plus the
// teaching material that only makes sense once you have tried.

const { loadRubric, scoreText } = require('./lib/rubric');

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

  const result = scoreText(prompt, rubric);

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
