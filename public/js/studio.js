// Agent Studio — assemble a dummy agent system and have its ARCHITECTURE
// scored, not its prose. Deterministic: no model calls, same design always
// yields the same verdict and the same replayed trace.

const PA_Studio = (() => {
  let spec = null;
  const design = {
    pipeline: [],              // ordered agent ids
    tools: {},                 // agentId -> Set of tool ids
    handoff: 'prose',          // contract used between every hop
    stepBudget: false,         // is a terminal step budget set
  };

  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const agent = id => spec.palette.find(a => a.id === id);
  const tool  = id => spec.tools.find(t => t.id === id);
  const toolsOf = id => [...(design.tools[id] || [])];

  // ---- Cost model ----------------------------------------------------
  // Each agent pays to receive context, plus whatever its tools cost.
  const HOP_CONTEXT = 900;
  function estimateTokens() {
    let total = 0;
    design.pipeline.forEach(id => {
      total += HOP_CONTEXT;
      toolsOf(id).forEach(t => { total += (tool(t) || { cost: 0 }).cost; });
    });
    // Provenance costs a little more to carry, prose costs re-derivation.
    if (design.handoff === 'provenance') total += 180 * Math.max(0, design.pipeline.length - 1);
    if (design.handoff === 'prose')      total += 650 * Math.max(0, design.pipeline.length - 1);
    return total;
  }

  // ---- The architecture rubric ---------------------------------------
  function evaluate() {
    const p = design.pipeline;
    const holder = p.find(id => toolsOf(id).includes('issue_refund'));
    const gateIdx = p.indexOf('gate');
    const holderIdx = holder ? p.indexOf(holder) : -1;
    const verIdx = p.indexOf('verifier');
    const tokens = estimateTokens();

    const dispatcherClean = !p.includes('dispatcher') || toolsOf('dispatcher').length === 0;
    const noSuperAgent = p.every(id => toolsOf(id).length <= 3);
    const policySplit = !(toolsOf('policy').includes('search_history'));

    // An empty board is not a passing design: without this, "isolation"
    // and "budget" would pass vacuously and show 2/6 before you start.
    if (!p.length) {
      return { tokens: 0, hasIssuer: false,
               results: Object.fromEntries(spec.checks.map(c => [c.id, false])) };
    }

    return {
      tokens,
      results: {
        isolation: dispatcherClean && noSuperAgent && policySplit,
        gate:      holderIdx > -1 && gateIdx > -1 && gateIdx < holderIdx,
        verify:    verIdx > -1 && (holderIdx === -1 || verIdx < holderIdx),
        handoff:   design.handoff !== 'prose',
        stop:      design.stepBudget === true,
        budget:    tokens <= 12000,
      },
      hasIssuer: holderIdx > -1,
    };
  }

  // ---- Rendering ------------------------------------------------------
  function renderPalette() {
    const wrap = $('#studio-palette');
    wrap.innerHTML = '';
    spec.palette.forEach(a => {
      const placed = design.pipeline.includes(a.id);
      const card = el('button', 'studio-chip' + (placed ? ' placed' : ''));
      card.type = 'button';
      card.innerHTML = `<strong>${a.name}</strong><span>${a.blurb}</span>`;
      card.addEventListener('click', () => {
        if (placed) {
          design.pipeline = design.pipeline.filter(x => x !== a.id);
          delete design.tools[a.id];
        } else {
          design.pipeline.push(a.id);
          design.tools[a.id] = new Set();
        }
        renderAll();
      });
      wrap.appendChild(card);
    });
  }

  function renderPipeline() {
    const wrap = $('#studio-pipeline');
    wrap.innerHTML = '';
    if (!design.pipeline.length) {
      wrap.appendChild(el('p', 'muted', 'Pick agents above to build the pipeline. Order is the order work flows.'));
      return;
    }
    design.pipeline.forEach((id, i) => {
      const a = agent(id);
      const row = el('div', 'studio-node' + (a.kind === 'human' ? ' is-human' : ''));
      const tools = spec.tools.map(t => {
        const on = toolsOf(id).includes(t.id);
        return `<label class="studio-tool${on ? ' on' : ''}${t.irreversible ? ' danger' : ''}">
          <input type="checkbox" data-agent="${id}" data-tool="${t.id}" ${on ? 'checked' : ''}>
          ${t.label}${t.irreversible ? ' ⚠' : ''}</label>`;
      }).join('');
      row.innerHTML = `
        <div class="studio-node-head">
          <span class="studio-step">${i + 1}</span>
          <strong>${a.name}</strong>
          <span class="tag">${a.kind}</span>
          <button class="studio-up" type="button" data-move="${id}" aria-label="Move earlier">↑</button>
        </div>
        <div class="studio-tools">${a.kind === 'human' ? '<span class="muted">Approves. Holds no tools.</span>' : tools}</div>`;
      wrap.appendChild(row);
    });

    wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const set = design.tools[cb.dataset.agent] || (design.tools[cb.dataset.agent] = new Set());
        cb.checked ? set.add(cb.dataset.tool) : set.delete(cb.dataset.tool);
        renderAll();
      });
    });
    wrap.querySelectorAll('[data-move]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.move, i = design.pipeline.indexOf(id);
        if (i > 0) { design.pipeline.splice(i, 1); design.pipeline.splice(i - 1, 0, id); renderAll(); }
      });
    });
  }

  function renderReview() {
    const { tokens, results } = evaluate();
    $('#studio-tokens').textContent = tokens.toLocaleString();
    $('#studio-tokens').parentElement.classList.toggle('warn', tokens > 12000);
    const wrap = $('#studio-checks');
    wrap.innerHTML = '';
    spec.checks.forEach(c => {
      const pass = results[c.id];
      const row = el('div', 'studio-check ' + (pass ? 'pass' : 'fail'));
      row.innerHTML = `<span class="studio-mark">${pass ? '✓' : '—'}</span>
        <span class="studio-check-body"><strong>${c.label}</strong><span>${pass ? c.want : c.fail}</span></span>`;
      wrap.appendChild(row);
    });
    const passed = Object.values(results).filter(Boolean).length;
    $('#studio-score').textContent = `${passed}/${spec.checks.length}`;
    $('#studio-run').disabled = design.pipeline.length === 0;
  }

  function renderAll() { renderPalette(); renderPipeline(); renderReview(); }

  // ---- The replayed trace ---------------------------------------------
  function buildTrace() {
    const { results, hasIssuer } = evaluate();
    const steps = [];
    let running = 0;
    steps.push({ kind: 'note', text: spec.trace.intro });
    design.pipeline.forEach((id, i) => {
      const a = agent(id);
      running += HOP_CONTEXT;
      toolsOf(id).forEach(t => { running += (tool(t) || { cost: 0 }).cost; });
      const from = i === 0 ? 'Ticket' : agent(design.pipeline[i - 1]).name;
      const carried = spec.handoffs.find(h => h.id === design.handoff);
      steps.push({ kind: 'msg', from, to: a.name, tools: toolsOf(id), carried: carried.label, tokens: running });
      if (a.kind === 'human') steps.push({ kind: 'gate', text: `${a.name}: approved` });
    });
    // Failures are injected where they would actually bite.
    if (!results.handoff) steps.push({ kind: 'break', text: spec.checks.find(c => c.id === 'handoff').fail });
    if (!results.verify)  steps.push({ kind: 'break', text: spec.checks.find(c => c.id === 'verify').fail });
    if (hasIssuer && !results.gate) steps.push({ kind: 'break', text: spec.checks.find(c => c.id === 'gate').fail });
    if (!results.stop)    steps.push({ kind: 'break', text: spec.checks.find(c => c.id === 'stop').fail });
    if (!results.isolation) steps.push({ kind: 'break', text: spec.checks.find(c => c.id === 'isolation').fail });
    steps.push({ kind: 'note', text: results.gate ? spec.trace.resolved : spec.trace.unresolved });
    return steps;
  }

  function runTrace() {
    const out = $('#studio-trace');
    const panel = $('#studio-result');
    panel.classList.add('vis');
    out.innerHTML = '';
    const steps = buildTrace();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    steps.forEach((s, i) => {
      const add = () => {
        let node;
        if (s.kind === 'msg') {
          node = el('div', 'trace-row');
          node.innerHTML = `<span class="trace-hop">${s.from} → <strong>${s.to}</strong></span>
            <span class="trace-meta">${s.tools.length ? s.tools.join(', ') : 'no tools'} · ${s.carried}</span>
            <span class="trace-tok">${s.tokens.toLocaleString()} tok</span>`;
        } else if (s.kind === 'gate') {
          node = el('div', 'trace-row trace-gate', `<span class="trace-hop">${s.text}</span>`);
        } else if (s.kind === 'break') {
          node = el('div', 'trace-row trace-break', `<span class="trace-hop">What broke</span><span class="trace-meta">${s.text}</span>`);
        } else {
          node = el('div', 'trace-row trace-note', `<span class="trace-hop">${s.text}</span>`);
        }
        out.appendChild(node);
        if (i === steps.length - 1) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      };
      reduced ? add() : setTimeout(add, i * 260);
    });
    if (window.PA_Sfx) PA_Sfx.confirm();
  }

  async function init() {
    try {
      spec = await fetch('content/studio-refund-desk.json').then(r => r.json());
    } catch (e) {
      $('#studio-brief').textContent = 'Could not load the studio scenario.';
      return;
    }
    $('#studio-brief').textContent = spec.brief;
    $('#studio-stakes').textContent = spec.stakes;
    document.title = `${spec.title} · Agent Studio · PromptArcade`;

    const hwrap = $('#studio-handoff');
    spec.handoffs.forEach(h => {
      const b = el('button', 'studio-opt' + (h.id === design.handoff ? ' on' : ''));
      b.type = 'button';
      b.innerHTML = `<strong>${h.label}</strong><span>${h.note}</span>`;
      b.addEventListener('click', () => {
        design.handoff = h.id;
        hwrap.querySelectorAll('.studio-opt').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        renderReview();
      });
      hwrap.appendChild(b);
    });

    $('#studio-stop').addEventListener('change', e => { design.stepBudget = e.target.checked; renderReview(); });
    $('#studio-run').addEventListener('click', runTrace);
    $('#studio-reset').addEventListener('click', () => {
      design.pipeline = []; design.tools = {}; design.handoff = 'prose'; design.stepBudget = false;
      $('#studio-stop').checked = false;
      $('#studio-result').classList.remove('vis');
      $('#studio-handoff').querySelectorAll('.studio-opt').forEach((x, i) => x.classList.toggle('on', i === 0));
      renderAll();
    });

    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { evaluate, estimateTokens, _design: design };
})();

if (typeof window !== 'undefined') window.PA_Studio = PA_Studio;
