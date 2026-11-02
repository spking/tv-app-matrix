# Matrix

A static site that displays a matrix kept in Google Sheets. It uses plain HTML, CSS and JS, with no build step and no dependencies, and is hosted on GitHub Pages.

## How it fits together

| File | Purpose |
|---|---|
| `config.js` | Title, list of tabs (name, CSV file, sheet `gid`), header rows, sticky columns, status-badge words |
| `data/*.csv` | The data. One CSV per tab, committed to the repo, so every change is in git history |
| `index.html`, `app.js`, `style.css` | Renders the CSV as a sortable, filterable table with sticky headers |
| `.github/workflows/refresh-data.yml` | One-click (or scheduled) pull from the Google Sheet, which commits the CSV only if it changed |

The live site never calls Google. It reads only the committed CSV, so it is fast, works if the sheet moves, and keeps a history of changes.

## Publish on GitHub Pages (one-time)

1. Create a repo and push this folder to `main`.
2. **Settings → Pages → Build and deployment**: Source *Deploy from a branch*, Branch `main` / `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.

## Updating the data

**Option A, from the sheet (recommended).** The sheet must be shared as *Anyone with the link can view*.
Go to **Actions → Refresh data from Google Sheet → Run workflow**. Pages redeploys automatically.
To refresh automatically, uncomment the `schedule:` block in the workflow.

**Option B, by hand.** In Sheets: *File → Download → Comma-separated values* for each tab. Save it over `data/<tab>.csv`, then commit and push.

## Multiple tabs

Add an entry per tab to `sheets` in `config.js`. The `gid` is the number after `gid=` in the URL when that tab is open.
Tabs appear as buttons, and the URL hash (`#TabName`) links straight to a tab.

## Notes

- Merged cells export as one value followed by blanks. Unmerge them in the sheet if every cell should show the value.
- Values listed under `status` in `config.js` get a coloured badge. Edit the word lists to match your matrix's vocabulary.
- Click a column header to sort (ascending → descending → original order). Sorting is natural, so "Item 2" comes before "Item 10".
- Run locally with `python3 -m http.server`. Opening `index.html` directly from disk won't load the CSV.
