# Grant Shelf

Grant Shelf is a static GitHub Pages-ready prototype for funding intelligence relevant to Trinidad and Tobago and the wider Caribbean.

## Why this rebuild is safer

This version is deliberately simple and robust:

- `index.html` contains the full webpage, styling, and browser behaviour.
- `grants.json` stores the records shown on the page.
- The page does **not** call Grants.gov directly from the browser.
- The optional GitHub Action runs a Python collector and updates `grants.json`.
- The page should still load even if the collector fails.

## Files

```text
index.html
grants.json
.nojekyll
verify.html
README.md
DEPLOYMENT.md
collectors/fetch_grantsgov.py
.github/workflows/update-grants.yml
```

## Publish on GitHub Pages

1. Upload all files to the repository root.
2. Go to **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Branch: `main`.
5. Folder: `/ root`.
6. Save.
7. Visit `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`.

## Quick test

After publishing, also test:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/verify.html
```

If `verify.html` loads but `index.html` does not, the issue is in `index.html`.
If neither loads, the issue is Pages settings or repository placement.

## Update grants

Go to **Actions → Update Grant Shelf Data → Run workflow**.

If it fails, the website should still load from the existing `grants.json`.

## Data caution

All live records should be verified on the official funder website before action. TTD conversions are estimates only.
