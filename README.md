# Grant Shelf MVP

Grant Shelf is a GitHub-first prototype for tracking real public grant opportunities and presenting them as Caribbean-aware decision cards.

## What this package includes

- `index.html` — frontend page
- `style.css` — responsive civic-tech styling
- `script.js` — reads `grants.json` and renders cards
- `grants.json` — frontend data file, initially empty until the collector runs
- `collectors/fetch_grantsgov.py` — server-side Python collector for Grants.gov
- `.github/workflows/update-grants.yml` — scheduled GitHub Action
- `data/source_plan.md` — source and thematic pull plan

## How it works

```text
GitHub Action
→ runs collectors/fetch_grantsgov.py
→ queries Grants.gov search2 by theme
→ writes grants.json
→ frontend reads grants.json
```

## Thematic areas pulled

- Climate / Environment / Resilience
- Youth / Education / Skills
- Digital / Data / Civic Technology
- Health / Mental Health / Community Support
- Culture / Archives / Heritage
- Caribbean / SIDS / Islands

## Important caution

The collector pulls real public records from Grants.gov, but not every record will be eligible for Trinidad & Tobago or Caribbean applicants. The frontend labels each live record as requiring verification.

## How to run locally

```bash
python collectors/fetch_grantsgov.py
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## How to use on GitHub

1. Create a new GitHub repository.
2. Upload these files.
3. Go to the Actions tab.
4. Run **Update Grant Shelf Data** manually once.
5. Enable GitHub Pages or connect the repository to Cloudflare Pages.

## Why not pull APIs directly from the browser?

Browser JavaScript is often blocked by CORS or API restrictions. GitHub Actions runs server-side and writes a clean `grants.json` file that the frontend can safely read.
