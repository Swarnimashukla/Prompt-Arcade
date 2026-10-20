# PromptArcade

Practice prompt engineering, context engineering and agent design on real
scenarios, and get told what your prompt actually did — not whether it
contained the right words.

Live at [promptarcade.netlify.app](https://promptarcade.netlify.app).

---

## Running it locally

```sh
npm install
npm run dev          # http://127.0.0.1:8888
```

`scripts/dev-server.mjs` serves `public/` and runs the Netlify functions
behind `/api/`, including the 404 on `/rubrics/`, so the site behaves
locally as it does in production. `netlify dev` works too if you have the
CLI; this exists so you do not need it.

```sh
npm test             # progress-merge and judge-verification tests
```

## Layout

```
public/              the site — this is Netlify's publish directory
  js/                tokens, state, evaluator, reveal, sfx, studio, auth
  content/           the level index and the Agent Studio scenario
  iterations/        archived visual directions, kept as a record
rubrics/             45 level definitions — NOT published
netlify/functions/   /api/brief and /api/score, plus the judge
supabase/            schema, RLS policies, and the merge test
```

`rubrics/` sits outside the publish directory on purpose. Each file holds
the reference answer and the criteria for one level, so serving it would
hand over the answer key before anyone had tried. `/api/brief` returns
only what is needed to render a level; the rest is released by
`/api/score` after an attempt.

## How scoring works

Each level has five dimensions, two criteria each, plus a responsibility
check and a token budget. There are two engines.

**The evidence-grounded judge** (default, when an API key is present).
A language model reads the attempt against the level's criteria. To pass
a criterion it must quote the span of the learner's own submission that
satisfies it — and the server then checks that the quote is really
there, allowing for case, smart quotes and whitespace but nothing more.

That one constraint handles both failure modes at once:

- A learner who pastes vocabulary produces no quotable clause that
  carries an instruction, so keyword-stuffing stops scoring.
- A model that awards a point and invents the evidence produces a quote
  that is not in the text, so the point is refused and counted.

Neither side is trusted. The submission is the arbiter, and the quotes
are shown back in the results as the reason each point was awarded.

**The pattern rubric** (fallback). Regular expressions over the
submission — cheap, deterministic, and gameable: a bag of the right
words with no instruction anywhere in it scores 10/10. It runs whenever
the judge cannot: no API key, a failed or slow call, or a response whose
evidence or coverage did not hold up. The results panel says which
engine read the attempt, because the difference matters.

The token budget stays arithmetic in both cases. It needs no model and
must not drift.

### Determinism

Sampling parameters are not available on current models, so the same
submission can come back graded slightly differently. Verdicts are
cached by a hash of the model, level and normalised submission, which
makes re-pressing Evaluate stable for as long as the function instance
stays warm. That covers the case that matters; it is not a global
guarantee and is not claimed as one.

## Configuration

Set in **Netlify → Site configuration → Environment variables**:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for the judge | Without it, scoring silently falls back to the pattern rubric. **This is a real secret** — it belongs here and nowhere else, never in the repository. |
| `PA_JUDGE_MODEL` | no | Defaults to `claude-sonnet-5-5`. |
| `PA_JUDGE_TIMEOUT_MS` | no | Defaults to 8000. A synchronous function has seconds, not minutes, and a learner is watching a button. |

Supabase's project URL and anon key live in
`public/js/supabase-config.js` and are committed deliberately: the anon
key is publishable by design, and row-level security in
`supabase/schema.sql` is what makes it safe. Every policy is scoped to
`auth.uid()`, and best-score-wins is enforced in the database rather
than in the browser. Accounts are optional — progress works in
localStorage until someone signs in, and the sign-in nudge appears only
after they have something worth keeping.
