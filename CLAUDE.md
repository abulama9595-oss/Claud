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
| `realestate.html` | Real-estate scenario tool (own engine `re-engine.js`, not the clinic engine). Two modes. **`home`**: up to four time-phased financing *strategies* (`RE_PLAN_PRESETS` / `inp.plans`, merged over `RE_PLAN_DEFAULTS`). Each strategy is a sequence of four facilities: `lm` mortgage on the new land at purchase (`landLtv` 90% — purchase finance; the cash-raising mortgages use 70%, always sized to the bank maximum unless the user fixes it; **no construction mortgage**), `eq` mortgage on a property the user already owns (`ownedValue × ownedLtv`, `eqWhen` start/build/month), `pl` personal loan (`plWhen`, `plCap`), `co` cash-out at completion (`cashoutLtv`), `rf` **refinance of personal loans (bank buy-out)** (`rfWhen`): the bank lends its MAXIMUM as new personal loans (each instalment ≤ `perLoanCap`, up to two — one per old loan bought out — within the bucket; personal-loan rate/tenure), pays off the chosen personal loans directly and pays out the rest; candidates are existing loans with `canRefi` and the strategy's PL, only once `refiMinMonths` (12) old (existing loans via `ageMonths` + t, blank = old enough); every subset is tried for the most net cash and must be cleared in full; mortgages are never refinanced or settled early (the cash-settlement pool holds personal loans only); reported as `rf.split`, `rf.refi {names, payoff, net}` and `refiTotal`. Sizing mode per facility `max`/`need`/`fixed`; **amounts are computed, not sliders**: capacity = min(LTV cap, product cap, principal the DBR room allows at that rate/tenure) where room = what is left of the ONE bucket `dbrCap × income − all instalments`, further capped per facility: mortgages ≤ `mortgageCap` (55%), one personal loan ≤ `perLoanCap` (33%), two personal loans allowed when `plSplit` (the engine reports `pl.split`). `optimizeRE(inp, {maxDelay, step, landWithBuild})` searches 96 mixes per start month (land mortgage max/need/none × PL × existing-property none/need/max-now/max-at-land × cash-out × settle policy), then tries refinance-at-completion variants on the strongest of them (~112 sims, ~0.2 s per start; `opts.plannedOnly` / `opts.delays` for one start, the UI fills the per-start table one start per tick) and returns per-start bests (`starts`, `planned`, `earliest`, each with `best.bucket` monthly instalment composition and `best.cleanPlan`); the UI shows it in Financing (planned start + bucket area chart) and When to start (per-start table), debounced 350 ms. `need` = remaining project spend − (cash − `cashBuffer`). Existing loans (`inp.existingLoans`, table + JSON/CSV import) can have a planned `settleAt` month and a `canSettle` flag; `settlePolicy` none/asNeeded/forMax (legacy `all` = asNeeded): personal loans are paid off from cash ONLY to make room for a MORTGAGE (lm/eq/co) — asNeeded greedily until it covers the funding gap, forMax (mortgage sized max) until it is no longer DBR-bound, i.e. reaches its LTV/product cap — in the month it is drawn so its proceeds cover the payoff — never for a personal loan or a refinance; the gap is re-measured after each cash settlement (SAMA `settleFeeMonths` early-settlement fee). Rates quoted `rateQuote` apr|flat (hamish → APR via `reFlatToApr`). Timing: `landMonth`, `buildStart`, `costInflation`; built area = land × `builtPct` × `floors`. Simulated month by month as a household cash balance; a plan whose cash goes negative is "not executable". **Ranking**: executable AND cash back to the buffer within `recoveryMonths` of move-in first, then executable, then net worth at horizon vs the renter / "not building" baseline. `timingSweepRE` reruns a strategy for every start and picks the earliest that passes both tests. `household.capTimeline` shows when borrowing room opens up. **`rental`**: capital stacks (`inp.options`) → levered/unlevered IRR, NPV, DSCR, yields. All money in full SAR. Scenarios in `localStorage` key `re_scenarios`; working state autosaved under `re_current`. **UI**: answer-first card (recommended strategy, earliest workable start, 6 KPIs with `Hint` hovers whose texts live in `EXPL`, blockers) above a sticky step nav — home: `You · The home · Financing · Results · When to start · Scenarios`; rental: `The property · Letting & you · Financing · Results · Scenarios`. One step rendered at a time (`step` state; Print renders all). Strategy cards show a generated sentence (`describePlan`), a status badge, 4 numbers and a facilities taken/bank-max mini table; controls sit behind "Edit strategy". Results table shows rows flagged `key` unless "Show all rows". `OPT_COLORS` fixed per slot. Engine untouched by presentation helpers. |
| `re-engine.js` | `RE_BASE`, `RE_PLAN_PRESETS`, `RE_OPTION_PRESETS`, `computeRE(inp)` (dispatches `rePlanSimulate` for home / `reSimulate` for rental), `tornadoRE(inp, idx)`, formatters `fS`/`fSAR`. Reuses `C` and `computeIRR` from `engine.js` (load engine.js first). Also `timingSweepRE(inp, idx, maxDelay, step, landWithBuild)`, `reFlatToApr`, `reEffRate`. Default sanity: `computeRE({})` → verdict `RENTING WINS` (default household can't carry the build cheaply), `prj.total` `3055912`. |
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
