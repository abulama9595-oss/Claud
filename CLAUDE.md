# Dental Clinic Feasibility Study — project guide

Interactive financial models for a dental venture in Riyadh, KSA. Pure single-file
React apps (no build step) sharing one engine. Hosted on GitHub Pages.

## Files
| File | What it is |
|------|-----------|
| `index.html` | Landing page — links the three models |
| `redesign.html` | **Primary** clinic model — investor-study layout, live KPIs, print/PDF, "Ask the study" assistant. This is where clinic features are built. |
| `original.html` | Original clinic layout, **frozen** for comparison. Runs the same engine; do not add features here (only touch if a shared-engine change would break it). |
| `pods.html` | Separate concept model: mall dental-hygiene-pod network (own engine `computePods`, not the clinic engine). |
| `engine.js` | Shared clinic engine — palette `C`, formatters `f0`/`pctf`, `BASE_INPUTS`, `compute(inp)`, `computeIRR`, sensitivity. Loaded as a classic `<script>` before each page's Babel app. |
| `components.jsx` | Shared UI primitives (Slider, Card, Chip, icons, `th`/`td`/`btn`). |
| `vendor/` | Self-hosted React, ReactDOM, Babel, PropTypes, Recharts (CDN is blocked in some networks — do NOT switch back to CDN). |

## Run & verify locally
```
python3 -m http.server 5500        # then open http://localhost:5500/
```
Verify UI changes with headless Chromium (Playwright is installed in the scratchpad dir):
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. Drive sliders by
finding the `<label>` then its sibling `input[type=range]` and dispatching an `input` event
via the native value setter. Screenshots confirm rendering. Always check `pageerror` is empty.

## Engine model — how revenue & pay work (current logic)
Revenue is **dentist-driven, chair-capped**, not chair-driven:
- `revPerChair` = monthly production of a **full-time salaried dentist** (works all `clinicDays`); part-timers scale by `dentistDays/clinicDays`.
- `seniorRevPerChair` = each senior's **full monthly book**, earned **regardless of days worked** (they bring their own caseload). Days only set chair occupancy & cost allocation. Independent slider from `revPerChair`.
- **Capacity cap with SENIOR PRIORITY**: chairs offer `chairs × clinicDays` chair-days/week. Seniors are rostered first (they cost nothing idle and bring their own patients); salaried dentists fill the remainder and their production scales to the days they actually get. Shortfalls reported: `salariedDisplacedDays` and `seniorRealization < 1`.
- Derived output `revPerChairFull` = production capacity ÷ chairs (sanity-check vs ~160K KSA norm), NOT an input.

Two pay tiers:
- **Salaried**: base salary + `profitShare`% of the profit on **their OWN production** (their collected billings − their salary − their share of clinic costs: materials on their production + operating costs by occupied chair-days). NOT a cut of the whole-clinic pool. With **0 seniors this reduces exactly to 35% of whole-clinic operating profit → bit-identical to the pre-two-tier model.**
- **Senior**: no salary; paid `seniorProdPct`% on `seniorPayBasis` ∈ {`gross` = % of collected production, `netmat` = net of materials & lab, `profit` = net of materials + allocated operating costs}, floored by `seniorMinMo` guarantee. Covered by the clinic malpractice policy (premiums count both tiers). Optional case-mix comes purely from the higher `seniorRevPerChair`.
- The margin the clinic keeps on senior books accrues to the **owner (EBITDA)**, not the salaried pool.

Both `compute()` (annual P&L + returns) and the 24-month monthly cash engine implement these; keep them in sync. `compute()` merges saved scenarios over `BASE_INPUTS`, so new input keys are backward-compatible (legacy `seniorRevMult` is still honored).

## Golden rule: regression
Any engine change **must leave the default scenario (and 0-senior scenarios) bit-identical**. Baseline check:
```
node -e "eval(require('fs').readFileSync('engine.js','utf8')); const m=compute({});
console.log(Math.round(m.totalRaise), m.irr, Math.round(m.npv), m.years.map(y=>Math.round(y.ebitda)))"
```
Default must give: totalRaise **9033**, IRR **~0.6717**, NPV **32980**, verdict **STRONG**, Y5 EBITDA **6875**.
(NPV was 32981 before the Y5 IT-depreciation fix — IT has a 4-year life, so Y5 dep drops 455→405, raising Y5 zakat ~1.25 and nudging NPV down ~0.7.)
There is a saved baseline JSON in the scratchpad during a session; re-capture one at the start of new work.

## Git & deploy workflow
- Develop on the branch **this session assigns** (a fresh `claude/*` branch each task — do not hardcode a name here, it drifts). Repo: `abulama9595-oss/Claud` (GitHub MCP tools, `mcp__github__*`).
- **GitHub Pages deploys from `main`.** So "push to production" = open a PR `head=<your session branch> base=main`, merge it, and the Pages "pages build and deployment" workflow deploys `main`.
- After a merge, the working branch is behind — **restart it from main before the next change** (keep the same branch name): `git fetch origin main && git checkout -B <your session branch> origin/main`. A merged PR is finished; never stack new work on merged history.
- Commit messages end with the Co-Authored-By + Claude-Session trailers already used in history. Do NOT put the model id anywhere in commits/PRs.
- The network is proxied and blocks `github.io`, so you can't fetch the live URL to verify — confirm deploys via the Actions run conclusion instead. NOTE: `mcp__github__actions_list` returns huge (~300KB) payloads; it saves to a file — parse with a tiny python snippet reading `d['workflow_runs'][0]`, don't dump it.

## Token-saving habits
Batch multiple changes per message; one feature per session then `/clear`; avoid repeated `actions_list` polling; verify deploys sparingly.

## Open housekeeping item
GitHub's **default branch is set to the working branch, not `main`** (unconventional; no effect on the live site). Switch to `main` if desired.
