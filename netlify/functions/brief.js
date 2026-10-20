// GET /api/brief?track=&sub=&n=
// The level as it is shown BEFORE an attempt: scenario, persona, the
// lazy prompt, hints, token budget. Deliberately omits the dimensions,
// and so every scoring pattern, plus the reference answer.

const { loadRubric, briefOf } = require('./lib/rubric');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=0, must-revalidate'
  };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use GET' }) };
  }
  const q = event.queryStringParameters || {};
  const rubric = loadRubric(q.track, q.sub, q.n);
  if (!rubric) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'No such level' }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify(briefOf(rubric)) };
};
