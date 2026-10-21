// PromptArcade · accounts and progress sync
//
// Anonymous-first by design. Everything works signed out, exactly as it
// did before; signing in only means your progress survives the device.
// If js/supabase-config.js still holds placeholders this module does
// nothing at all, so the site is safe to deploy before it is configured.

const PA_Auth = (() => {
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  const NUDGE_DISMISSED = 'promptarcade.nudge.dismissed';

  let client = null;
  let session = null;
  let ready = false;

  const cfg = () => (typeof window !== 'undefined' && window.PA_SUPABASE) || null;
  const configured = () => {
    const c = cfg();
    return !!(c && c.url && c.anonKey && !c.url.includes('YOUR_') && !c.anonKey.includes('YOUR_'));
  };

  // ──────────────────────────── merge ────────────────────────────
  // Pure, and deliberately so: this is the one piece that can silently
  // destroy someone's work, so it is unit-tested rather than trusted.
  //
  // local  : PA_State levels map, { levelId: { tier, tierLevel, score, ... } }
  // remote : rows from the progress table
  // Higher score wins per level, matching PA_State.recordLevel, which
  // only overwrites when the new score beats the stored one.
  function mergeProgress(local, remote) {
    const levels = {};
    const byId = {};

    (remote || []).forEach(r => {
      byId[r.level_id] = {
        tier: r.tier,
        tierLevel: r.tier_level,
        score: r.score,
        tokens: r.tokens,
        passedBudget: r.passed_budget,
        savedTokens: 0,
        ts: r.updated_at ? Date.parse(r.updated_at) : 0
      };
    });

    Object.keys(byId).forEach(id => { levels[id] = byId[id]; });

    const toPush = [];
    Object.keys(local || {}).forEach(id => {
      const l = local[id];
      if (!l || typeof l.score !== 'number') return;
      const r = byId[id];
      if (!r || l.score > r.score) {
        levels[id] = l;
        toPush.push(id);        // local is better (or new) — remote needs it
      }
    });

    return { levels, toPush };
  }

  // XP is derived, never stored, so the two sides cannot disagree about it.
  function xpFor(levels) {
    return Object.values(levels || {}).reduce(
      (sum, l) => sum + ((l.tierLevel || 0) * 75) + ((l.score || 0) * 5), 0);
  }

  // ──────────────────────────── plumbing ────────────────────────────
  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement('script');
      s.src = SDK;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Supabase SDK failed to load'));
      document.head.appendChild(s);
    });
  }

  function readLocal() {
    try { return (window.PA_State && PA_State.get().levels) || {}; } catch (e) { return {}; }
  }

  function writeLocal(levels, xp) {
    try {
      const KEY = 'promptarcade.v2';
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      s.levels = levels;
      s.xp = xp;
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
  }

  async function pull() {
    const { data, error } = await client.from('progress').select('*');
    if (error) { console.warn('[auth] progress pull failed:', error.message); return []; }
    return data || [];
  }

  async function push(levelId, l) {
    const { error } = await client.rpc('record_progress', {
      p_level_id: levelId,
      p_tier: l.tier || 'Draft',
      p_tier_level: l.tierLevel || 0,
      p_score: l.score || 0,
      p_tokens: l.tokens || 0,
      p_passed_budget: !!l.passedBudget
    });
    if (error) console.warn('[auth] progress push failed:', error.message);
    return !error;
  }

  // The moment that matters: someone has played anonymously and just
  // signed in. Their local progress must survive, or we have broken the
  // exact promise that persuaded them to sign in.
  async function syncOnSignIn() {
    const local = readLocal();
    const remote = await pull();
    const { levels, toPush } = mergeProgress(local, remote);
    writeLocal(levels, xpFor(levels));
    for (const id of toPush) await push(id, levels[id]);
    render();
    if (toPush.length) {
      toast(`${toPush.length} level${toPush.length === 1 ? '' : 's'} saved to your account.`);
    }
    return { merged: Object.keys(levels).length, pushed: toPush.length };
  }

  // ──────────────────────────── UI ────────────────────────────
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function toast(msg) {
    const t = el('div', 'pa-toast', msg);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('vis'), 20);
    setTimeout(() => { t.classList.remove('vis'); setTimeout(() => t.remove(), 400); }, 4200);
  }

  async function signIn() {
    if (!client) return;
    // Come back to the page they left, minus any existing hash or query
    // — the provider appends its own fragment and two of them collide.
    //
    // Supabase only honours this if the URL matches an entry in the
    // project's Redirect URLs; otherwise it silently falls back to the
    // project's Site URL. A sign-in that lands on localhost:3000 means
    // Site URL is still the Supabase default and this value was ignored,
    // which is a dashboard setting, not something code can force.
    const back = window.location.origin + window.location.pathname;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: back }
    });
    if (error) toast('Sign-in failed. Please try again.');
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    session = null;
    render();
    toast('Signed out. Progress on this device is kept.');
  }

  function render() {
    const bar = document.querySelector('.topbar-inner');
    if (!bar) return;
    let chip = bar.querySelector('.pa-account');
    if (!chip) {
      chip = el('button', 'pa-account');
      chip.type = 'button';
      bar.appendChild(chip);
    }
    if (session) {
      const name = (session.user.user_metadata &&
        (session.user.user_metadata.full_name || session.user.user_metadata.name)) ||
        session.user.email || 'Account';
      const done = Object.keys(readLocal()).length;
      chip.textContent = `${String(name).split(' ')[0]} · ${done} saved`;
      chip.title = 'Sign out';
      chip.onclick = signOut;
      chip.setAttribute('data-signed-in', 'true');
    } else {
      chip.textContent = 'Save progress';
      chip.title = 'Sign in with Google to keep your progress across devices';
      chip.onclick = signIn;
      chip.removeAttribute('data-signed-in');
    }
    document.querySelectorAll('.pa-nudge').forEach(n => { if (session) n.remove(); });
  }

  // Nudge on achievement, not on arrival. Shown after a first Surgical,
  // or once two levels are done — whichever comes first.
  function maybeNudge(detail) {
    if (session || !configured()) return;
    try { if (localStorage.getItem(NUDGE_DISMISSED) === '1') return; } catch (e) {}
    const levels = readLocal();
    const count = Object.keys(levels).length;
    const surgical = (detail && detail.result && detail.result.tier &&
      detail.result.tier.level === 3) ||
      Object.values(levels).some(l => (l.tierLevel || 0) === 3);
    if (!surgical && count < 2) return;

    const host = document.getElementById('feedback') || document.querySelector('main');
    if (!host || host.querySelector('.pa-nudge')) return;

    const card = el('div', 'pa-nudge', `
      <div class="pa-nudge-body">
        <strong>${surgical ? 'Nice — that was Surgical.' : `${count} levels done.`}</strong>
        <span>Your progress lives in this browser only. Sign in and it follows you to any device.</span>
      </div>
      <div class="pa-nudge-actions">
        <button type="button" class="btn btn-sm pa-nudge-yes">Save my progress</button>
        <button type="button" class="btn btn-ghost btn-sm pa-nudge-no">Not now</button>
      </div>`);
    host.appendChild(card);
    card.querySelector('.pa-nudge-yes').onclick = signIn;
    card.querySelector('.pa-nudge-no').onclick = () => {
      try { localStorage.setItem(NUDGE_DISMISSED, '1'); } catch (e) {}
      card.remove();
    };
  }

  // ──────────────────────────── init ────────────────────────────
  async function init() {
    if (!configured()) return;            // inert until credentials exist
    try {
      await loadSdk();
      client = window.supabase.createClient(cfg().url, cfg().anonKey, {
        auth: {
          // Read the token out of the returning URL, then take it back
          // out of the address bar so it is not sitting in history, in a
          // screenshot, or in anything the person pastes to someone.
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
          flowType: 'pkce'
        }
      });
    } catch (e) {
      console.warn('[auth] disabled:', e.message);
      return;
    }
    ready = true;

    const { data } = await client.auth.getSession();
    session = data ? data.session : null;
    render();
    if (session) await syncOnSignIn();

    client.auth.onAuthStateChange(async (event, s) => {
      const wasSignedOut = !session;
      session = s;
      render();
      if (s && wasSignedOut && event === 'SIGNED_IN') await syncOnSignIn();
    });

    window.addEventListener('pa:level-recorded', async e => {
      if (session) {
        const levels = readLocal();
        const id = e.detail && e.detail.id;
        if (id && levels[id]) await push(id, levels[id]);
        render();
      } else {
        maybeNudge(e.detail);
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { mergeProgress, xpFor, signIn, signOut, isReady: () => ready,
           isSignedIn: () => !!session, _syncOnSignIn: syncOnSignIn };
})();

if (typeof window !== 'undefined') window.PA_Auth = PA_Auth;
if (typeof module !== 'undefined' && module.exports) module.exports = { PA_Auth };
