# Design iterations

Frozen explorations kept for reference. Nothing here is part of the live
site; the production pages are at the repository root.

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
