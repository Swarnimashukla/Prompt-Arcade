# Design iterations

Frozen explorations kept for reference. Nothing here is part of the live
site; the production pages are at the repository root.

## `mario/` — late-90s 3D platformer

**This is the live direction.** `css/mario.css` at the repository root
is the maintained version; this folder holds the original two-page
build it grew from, kept because it is a self-contained snapshot.

A dusk palette was tried and rejected: slate sky, white headings, bright
primaries only on controls. It is a palette-only delta and lives in
commit `6ad0953` if it is ever wanted again. It is deliberately not kept
as a file here, because it predates the Read-more field reports and the
hero-stamp fix and would quietly regress them if swapped back in.

Built from `prompt_arcade_mario_spec.md`: sky-blue world with drawn
clouds and a faint castle-floor checkerboard, floating translucent
signboards (4px white border, 24px radius, bouncy drop shadow),
Fredoka One for extruded headings and Nunito for body, and squish-and-
stretch hover on every control.

The governing rule, taken straight from the spec, is that **headings
are loud and body text is not**. Long prose stays dark grey on
near-white with no shadow, which is why this theme carries a full
scenario brief comfortably where the FF7 one did not.

Same three substitutions as `ff7/`, for the same reason — no network
access to the asset hosts:

| Spec | Substitute |
|---|---|
| `cartoon-glove.png` | inline SVG data-URI, drawn as a gloved hand |
| Kenney platformer `.ogg` clips | Web Audio oscillators: a rising sine bloop on hover, a B5 to E6 coin on click, a descending triangle boing on a rejected action. Held at the specified 0.2 volume |
| cloud / checkerboard art | layered CSS gradients and a masked conic checkerboard |

Two contrast problems surfaced in review and were fixed: prose sitting
directly on the sky (rather than inside a signboard) is white with a
soft shadow instead of dark grey, and headings inside a white card take
a flat blue rather than the gold-on-black outline, which is unreadable
at card size.


## `ff7/` — 1997 JRPG pause menu

Built from `prompt_arcade_ffvii_spec.md`: the classic blue panel
(`#0000A0` → `#000020`, white outer border, inset grey border, hard drop
shadow), VT323 throughout, retro yellow for selection, a pixel glove
cursor, and synthesised menu SFX.

Shelved as **too cluttered for text-heavy content**. The chrome competes
with the scenario briefs and rubric feedback, which are the point of the
product. Worth revisiting for a narrower surface — a results screen, an
achievement, an onboarding sequence — where the density is an asset
rather than a tax.

Three spec items were substituted because this build environment cannot
reach OpenGameArt, Kenney or Freesound:

| Spec | Substitute |
|---|---|
| `glove-cursor.png` | inline SVG data-URI, drawn pixel by pixel |
| Kenney / Freesound `.ogg` clips | Web Audio oscillators (square blip, two-tone confirm, sawtooth buzz) at the specified 0.15 volume |
| blurred pre-rendered CGI background | layered CSS gradients, pixel grid, scanlines |

### Running it

`iterations/ff7/index.html` and `level.html` are self-contained for
theme (`ff7.css`, `sfx.js` sit beside them) but share the engine and
data at the repository root, reached via `../../`. The level page sets
`window.PA_BASE` so `js/evaluator.js` resolves rubric URLs correctly
from a subdirectory; that variable defaults to empty, so the root pages
behave exactly as before.

Links to Tracks and the Field Guide leave the iteration and land on the
live pages, since only these two were themed.
