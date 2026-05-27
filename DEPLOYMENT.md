# Deployment Checklist

Use this checklist if GitHub Pages does not load.

## 1. Confirm root files

The Code tab should show these files immediately, not inside another folder:

```text
index.html
grants.json
.nojekyll
verify.html
README.md
collectors
.github
```

## 2. Enable Pages

Settings → Pages:

```text
Source: Deploy from a branch
Branch: main
Folder: / root
```

Save and wait 1–3 minutes.

## 3. Test verify page

Open:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/verify.html
```

If this loads, GitHub Pages is working.

## 4. Test main page

Open:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/
```

## 5. If the page is blank

Open browser console. The rebuilt page should display an error panel if `grants.json` fails to load.

## 6. If Actions cannot update grants.json

Settings → Actions → General → Workflow permissions:

```text
Read and write permissions
```

Save and rerun the workflow.
