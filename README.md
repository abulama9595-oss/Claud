# Dental Clinic · Financial Feasibility Study

An interactive financial model for establishing a 10-chair dental clinic in
Riyadh, Saudi Arabia. Same engine, two presentations — pick a layout from the
landing page.

| File | What it is |
|------|-----------|
| `index.html` | Landing page — choose a version |
| `redesign.html` | Redesigned, investor-document layout (executive study + live KPIs + print/PDF) |
| `original.html` | Original single-scroll workspace, preserved for comparison |
| `serve.ps1` | Static file server for Windows (PowerShell) |

Both layouts run the **identical** model: a live financial engine (revenue
ramp, staffing, CapEx, VAT, cash-flow trough, IRR/NPV, sensitivity &
break-even). It's a single-file React app — React, ReactDOM, Babel and
Recharts are loaded from CDNs, so **no build step** is required; you just need
a static server (the CDN scripts require `http://`, not `file://`).

## Run it

### Windows (PowerShell)
```powershell
./serve.ps1
# then open http://localhost:5500/
```

### macOS / Linux (Python)
```bash
python3 -m http.server 5500
# then open http://localhost:5500/
```

### Anything with Node
```bash
npx serve -l 5500 .
```

## Notes
- Saved scenarios are stored in the browser via `localStorage` (key
  `dental_scenarios`), so they persist per-browser with no backend.
- All monetary figures are in SAR '000 unless labelled otherwise.
