# Sjónvarps · App Matrix

A static site, hosted on GitHub Pages, that shows which streaming apps work on which TV operating systems.

- **Public page:** `https://spking.github.io/tv-app-matrix/`
- **Editor:** `https://spking.github.io/tv-app-matrix/admin.html` (not linked from the public page)

## How it works

```
admin.html ──(your GitHub token)──▶ commit to main ──▶ check data ──▶ deploy to Pages
```

- The data lives in the repo: `data/matrix.json`, plus logo images in `logos/`. There is no Google Sheet anymore.
- The editor saves by committing to this repo with **your own GitHub token**. Anyone can open the editor page, but only someone with a token that has write access to this repo can save.
- **Invalid data never reaches the site.** The editor checks before saving, and every deploy re-checks with the same rules (`validate.js`). If the check fails, nothing is deployed and the site keeps its last good version. This also covers edits made directly on GitHub.
- Every save is a commit with a plain-language message, such as "Vísir á WebOS (LG): Nei → Já". The full history is on GitHub, and any change can be undone there.

## One-time setup

### Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**
This is required for the data check: with "Deploy from a branch", GitHub publishes the files without running the check.

### Your editor token

1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** ([direct link](https://github.com/settings/personal-access-tokens/new)).
2. **Repository access:** *Only select repositories* → `spking/tv-app-matrix`.
3. **Permissions → Repository permissions:**
   - **Contents: Read and write** (required, to save)
   - **Actions: Read-only** (optional; lets the editor tell you when the change is live)
4. Pick an expiry date, generate the token, and paste it into the editor. Tick *Muna á þessu tæki* to stay connected on that device.

The token is stored only in that browser. Use **Aftengjast** in the editor to remove it. If a token is lost or leaked, delete it on GitHub, where it stops working immediately, and make a new one.

To let someone else edit, add them as a collaborator on the repo (**Settings → Collaborators**). They then create their own token the same way.

## Editing

Open `admin.html` and connect. You can then:

- **Toggle Já/Nei** by clicking a cell.
- **Add an operating system** with **+ Stýrikerfi**. The name is what everyone sees, so include anything that tells rows apart (for example `TitanOS 2024+`). Put the TV brands in *Sjónvörp*, for example `Hisense`. They appear behind a small ⓘ next to the name (on hover, or a tap on phones) and are still found by search.
- **Add an app** with **+ App**, then click its logo tile to upload a logo. PNG, JPG, WebP and SVG all work; square logos look best. Images are scaled down automatically.
- **Reorder** with ▲ ▼ ◀ ▶, **delete** with ✕, and **remove a logo** with ⌫.
- **Write the Leiðavísir** (guide box) below the matrix. A blank line starts a new paragraph, lines starting with `- ` become bullet points, and web addresses become links. A preview shows how it will look. The box is hidden on the public page while the text is empty.
- **Edit general text and sources** below that. Tick *Úrelt* (outdated) to show a source as dead.

**Vista og birta** (save and publish) lists your changes for confirmation, then saves them as a single commit. The editor follows the deploy and tells you when the change is live, which usually takes about a minute. When you change the sources, their "uppfært" date is set to today automatically. Who changed what, and when, is in the repo's commit history.

If someone else saved while you were editing, your save is refused instead of overwriting theirs. Reload and make your change again.

## Version number

The subtitle starts with **útgáfa X.Y**, which updates itself on every deploy:

- **Y** goes up by one with every commit pushed to `main`, and every save in the editor is one commit. A push containing several commits moves it up by that many.
- The number is the repo's commit count minus `base` in `version.json`. The same content always has the same number, and nothing is written back to the repo.
- It is added only to the deployed copy of the data, so the editor's *Undirtitill* field holds just the text after it.

**To start a new main version** (for example 4.0): note the current version shown on the site, say 3.17. In `version.json`, set `"major": 4` and add the current minor plus 1 to `base` (so if `base` is 9, it becomes 9 + 17 + 1 = 27). That edit is itself a commit and deploys as 4.0. If you'd rather not do the sum, ask Claude.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `app.js`, `style.css` | The public page |
| `admin.html`, `admin.js`, `admin.css` | The editor |
| `validate.js` | Data rules, shared by the editor and the deploy check |
| `render-guide.js` | Formats the Leiðavísir text, shared by the page and the editor preview |
| `data/matrix.json` | The matrix, title texts and sources |
| `version.json` | Main version number and counting base for "útgáfa X.Y" |
| `scripts/stamp-version.mjs` | Writes the version into the deployed copy of the data |
| `logos/` | App logos, referenced from `data/matrix.json` |
| `scripts/check.mjs` | Deploy check (`npm run check`) |
| `.github/workflows/site.yml` | Check and deploy on every push to `main` |

## Working locally (optional)

```bash
npm run check    # validate data/matrix.json
npm run serve    # http://localhost:8000 (the editor works locally too, and saves to GitHub)
```

No dependencies to install.
