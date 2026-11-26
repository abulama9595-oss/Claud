# Land opportunity tool (`opportunity.html`, `opp-engine.js`, `tests/opp/`)

Is this plot worth developing? A screening tool for a plot in Riyadh: you enter the land, the tool applies typical Riyadh building rules to find what you may build and sell, then every number that decides it. The header comment of `opp-engine.js` is the source of truth for the model.

## The steps
1. **The land** — any two of frontage, depth and area (the third is worked out), or the area only (then the setbacks cannot be checked and the footprint uses the coverage alone — said in the watch-outs). Up to three streets, each on a side (front / left / right / rear) with its width. Land price per m², transfer tax, broker.
2. **What you build** — apartment building or villas / townhouses. The rules come from `OPP_CODES[type]` and are editable; each field says "typical Riyadh rule" or shows the code value with "use it". Street setback = clamp(street width × %, min, max); side and rear setbacks; floors (ground included), ground / upper coverage, roof annex %; apartments: basement levels (cost and parking, never sold), a parking ground floor (not sold); villas: the number of villas or a plot width (area only: a plot area), attached townhouses (only the end plots keep a side setback), the smallest plot allowed. Parking need vs room. A plan of the plot to scale (SVG).
3. **What you sell** — utility share → sellable area; apartment size (or the count) → units; price per m² ↔ per unit; selling months and costs; off-plan (Wafi) share collected during construction, with a discount.
4. **Costs and time** — building cost per m² (above ground), basement cost, design/permits/supervision %, contingency % (on construction + design, as the real-estate tool counts it), VAT % (not recovered: a residential sale carries no VAT), extras, permit fees; design and construction months; an optional land loan (interest monthly, repaid at completion); your target margin (Go at or above it, Borderline at half of it or more) and the NPV rate.

## Your answer
The verdict line; the numbers that decide (profit, margins, IRR, NPV, peak cash and payback month, profit per m² of land, cost per sellable m² split land / build, cost per unit, equity multiple); break-evens (sale price, the price for your target, building cost, units to sell); **the most you should pay for the land** at your target margin (and at break-even) against your price; the area and money cascades; a price × building-cost heatmap; the tornado (inputs that do not move the profit are named, not drawn); three cases; the cash month by month; watch-outs. Save, print / PDF, and **Open in the real-estate tool**.

## The handoff (`oppToRE2`)
Writes a build-and-sell scenario ("Opportunity: name") into `re2_scenarios` and `re2_current` (and the name, as plain text, into `re2_current_name`), keeping your cash, salary, loans and plans from the real-estate tool's current scenario, then opens `realestate-v2.html`. The land in month 1 there (month 0 here), the building as one above-ground area (`builtPct` = area ÷ land, `floors` 1, the basement folded into the cost per m²), the units and the price per unit = sales ÷ units, no growth. `tests/opp/handoff.test.js`: the real-estate engine gets the same all-in cost, built area, units, sales total and completion month.

## Storage
`opp_current`, `opp_current_name`, `opp_scenarios` (`{name: {inp, savedAt}}`; on studio it syncs through studio.js like any `_scenarios` key). The Opportunities tab ranks every saved plot (margin, profit, profit per m² of land, IRR, least peak cash, land headroom); remove with undo.

## Version tag and tests
`?v=` on the engine's script tag = the first 10 hex of sha1(opp-engine.js) (`tests/opp/page.test.js` prints it). `node --test "tests/opp/*.test.js"` (11: land and setbacks, footprint and areas, villas, money identities and the cash flow, break-evens and the residual land value exactly, sensitivity / tornado / cases / verdict / IRR, the handoff, the page compiles, the tag, the landing link). Synthetic figures only.

## The codes
Public sources disagree (front setback a fifth of the street width with a 3 m or a 6 m minimum; apartment coverage 60–75%; 3 to 9 floors by zone; villas since July 2025: 75% on the ground and first floors, a roof annex up to 70%). The tool never presents them as the official code — every rule is a labelled, editable default; check the plot's building permit or planning certificate.
