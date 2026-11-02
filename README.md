# Sjónvarps · App Matrix

A static site, hosted on GitHub Pages, that shows which streaming apps work on which TV operating systems. The Google Sheet stays the single source of truth. This repo turns it into a fast, searchable page that works on phones and prints well.

## How it works

```
Google Sheet ──(Web page .html, zipped)──▶ scripts/build-data.mjs ──▶ data/matrix.json + data/img/ ──▶ index.html
```

- The live page reads only `data/matrix.json`. It never calls Google, so it is fast and doesn't depend on how the sheet is shared.
- The converter finds the title, header row, logo row, OS rows, "Síðast uppfært" date and author **by structure, not fixed row numbers**. Adding an OS row or an app column in the sheet needs no code change.
- The HTML export (rather than CSV) keeps link labels, strikethrough (dead sources) and the logo row.
- If Google ever changes its export format, the conversion fails loudly and the last good data stays live.

## One-time setup

1. Push this repo to GitHub on branch `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Make sure the sheet is shared as **Anyone with the link can view** (needed only for option A below).

The site appears at `https://<user>.github.io/<repo>/`.

## Updating the matrix

Edit the Google Sheet as usual, then either:

- **A. One click:** go to **Actions → Update & deploy → Run workflow**. It pulls the sheet, commits the changed data and deploys.
- **B. Manual upload:** in Sheets, go to *File → Download → Web page (.html, zipped)*. On GitHub, open the `import/` folder (or create it) and use *Add file → Upload files* to upload the zip. The workflow converts it, removes the zip and deploys.

To check the sheet automatically, uncomment `schedule:` in `.github/workflows/site.yml`.

## Logos

The sheet's logo row is used automatically. To use a sharper image, drop a file into `logos/` named after the app's slug:

| App | File |
|---|---|
| Sjónvarp Símans | `logos/sjonvarp-simans.png` |
| Sýn | `logos/syn.png` |
| RÚV Appið | `logos/ruv-appid.png` |
| Nova TV | `logos/nova-tv.png` |
| Vísir | `logos/visir.png` |
| Viaplay | `logos/viaplay.png` |
| HBO Max | `logos/hbo-max.jpg` |
| Prime | `logos/prime.png` |

Any of `.png .jpg .svg .webp` works. The converter prints each app's slug, so new apps show what name to use. Apps without a logo get a two-letter placeholder.

## Using the page

- **Search** understands TV brands, OS names and app names, ignoring accents. `samsung hbo` shows the Tizen row, highlights HBO Max and answers "HBO Max á Tizen (Samsung): ✓ Já". `philips` shows both TitanOS rows. The search is kept in the URL (`?q=…`), so a link can be shared.
- **On phones**, each OS becomes a card, with the searched app at the top.
- **Print** gives A4 landscape: the table on one page, with the sources listed after it.

## Working locally (optional)

```bash
npm ci
npm run build-data      # converts test/fixture/ (a copy of the sheet's export)
npm run serve           # http://localhost:8000
```

To try a fresh download: `node scripts/build-data.mjs <unzipped folder>`. If the tabs are renamed, set `MATRIX_TAB` / `SOURCES_TAB` (defaults: `S.A.M`, `Heimildir`).
