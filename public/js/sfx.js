// Platformer SFX, synthesised with Web Audio rather than shipped as files.
// The spec asked for Kenney's platformer pack; oscillators get the same
// cheerful, short, percussive character with no assets and no licence
// question. Volume is held at the specified 0.2 and the whole thing can
// be switched off from the HUD. The preference persists.

const PA_Sfx = (() => {
  const KEY = 'promptarcade.sfx';
  const VOLUME = 0.2;
  let ctx = null;
  let enabled = true;

  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) {}

  // Browsers keep an AudioContext suspended until a user gesture, so
  // nothing sounds until the player actually interacts with the page.
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq, to, start = 0, dur = 0.1, type = 'square', gain = VOLUME }) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + start;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Soft rising bloop for hover.
  const tick = () => { if (enabled) tone({ freq: 520, to: 760, dur: 0.07, type: 'sine', gain: VOLUME * 0.55 }); };

  // The coin: B5 then E6, which is the interval everyone recognises.
  const confirm = () => {
    if (!enabled) return;
    tone({ freq: 987.77, dur: 0.07, type: 'square', gain: VOLUME * 0.7 });
    tone({ freq: 1318.51, start: 0.07, dur: 0.22, type: 'square', gain: VOLUME * 0.7 });
  };

  // Cartoon boing for a rejected action.
  const error = () => { if (enabled) tone({ freq: 420, to: 110, dur: 0.3, type: 'triangle', gain: VOLUME * 0.8 }); };


  const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor"/>'
    + '<path d="M15.4 9.2a4 4 0 0 1 0 5.6M18 6.6a7.6 7.6 0 0 1 0 10.8" fill="none"'
    + ' stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';

  const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor"/>'
    + '<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none"'
    + ' stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';

  function paint(btn, on) {
    btn.innerHTML = (on ? ICON_ON : ICON_OFF)
      + '<span class="sfx-sr">' + (on ? 'Sound on' : 'Sound off') + '</span>';
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Mute sound effects' : 'Unmute sound effects');
    btn.title = on ? 'Mute sound effects' : 'Unmute sound effects';
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    const btn = document.querySelector('.sfx-toggle');
    if (btn) paint(btn, on);
    if (on) confirm();
  }

  function mount() {
    const bar = document.querySelector('.topbar-inner');
    if (bar && !document.querySelector('.sfx-toggle')) {
      const btn = document.createElement('button');
      btn.className = 'sfx-toggle';
      btn.type = 'button';
      paint(btn, enabled);
      btn.addEventListener('click', () => setEnabled(!enabled));
      bar.appendChild(btn);
    }

    const SELECTOR = 'a, button, summary, .track-card, .sub-card, .scenario-card, .sp-card, .lp-btn';
    // Delegated, so panels rendered later are covered without re-binding.
    document.addEventListener('mouseover', e => {
      const el = e.target.closest(SELECTOR);
      if (!el || el.classList.contains('sfx-toggle')) return;
      if (el === mount._last) return;
      mount._last = el;
      tick();
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest(SELECTOR) === mount._last) mount._last = null;
    });
    document.addEventListener('click', e => {
      const el = e.target.closest(SELECTOR);
      if (!el || el.classList.contains('sfx-toggle')) return;
      confirm();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  return { tick, confirm, error, setEnabled, isEnabled: () => enabled };
})();

if (typeof window !== 'undefined') window.PA_Sfx = PA_Sfx;
