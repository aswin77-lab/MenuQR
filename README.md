# 368 Digital QR Menu — GitHub Pages edition

A multi-restaurant digital menu that runs on **plain HTML, CSS and JavaScript only**: no server, no database, no paid domain. Hosted free on GitHub Pages. Theme (deep forest green + antique gold) is taken from the 368 logo.

## How it works

```
Owner  ──▶  admin.html  ──(publish with GitHub token)──▶  GitHub repository
                                                              │ GitHub Pages
Customer ─ scans QR ─▶  index.html?r=<restaurant>  ◀── reads data/<restaurant>.json
```

- `index.html` is the customer menu. The QR code opens `https://YOU.github.io/REPO/?r=368` — the part after `r=` picks the restaurant.
- `admin.html` is the owner dashboard. You edit a **draft** in your browser, preview it, then click **Publish to GitHub**. The dashboard saves `data/<restaurant>.json` and the images into your repository. After GitHub Pages rebuilds (about 1–2 minutes) everyone who scans the same QR sees the new menu. **The QR never changes.**
- Customers also get updates while the menu is open (it re-checks when the tab regains focus and every minute).

```
qr-menu/
├── index.html            customer menu
├── admin.html            owner dashboard
├── css/  theme.css  menu.css  admin.css
├── js/   common.js  menu.js  admin.js  github.js  zip.js
│         vendor/qrcode.js   (qrcode-generator 1.4.4, MIT)
├── data/ restaurants.json  368.json      ← published menus (sample: 368)
└── assets/368/logo.jpg                   ← images, one folder per restaurant
```

## Important: what "login" means here (read this)

There is no server, so there can be **no real password login**. Anyone can *open* `admin.html`, but nobody can *publish* without a GitHub token that has write access to your repository. **The token is the key.** Therefore:

- Keep the token private. Create it for **this one repository only**, with *Contents: Read and write* permission.
- The token is typed into the dashboard and stays in your browser (session by default). It is never in the code or the repo.
- Anyone holding the token can change **every** restaurant in the repo. This suits one operator (you) managing several restaurants, or owners who fully trust each other. If restaurants must be strictly isolated from one another, use **one repository per restaurant** — or move to Firebase/Supabase later (real logins + per-owner rules).
- Not available without a backend: forgot-password, instant real-time push, server-side upload rules. Image type/size limits are enforced in the dashboard (JPG/PNG/WebP, up to 10 MB, auto-resized to ≈900 px).

## Set-up, step by step (about 15 minutes)

### 1. Create the repository
1. Sign in at github.com → **New repository**. Name it e.g. `menu`. Choose **Public** (free GitHub Pages needs a public repo on the free plan). Create it.
2. Click **uploading an existing file**, drag in **everything inside the `qr-menu` folder** (keep the folders `css`, `js`, `data`, `assets`), and **Commit changes**.

### 2. Turn on GitHub Pages
**Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.** After a minute or two your site is at `https://YOUR-USERNAME.github.io/menu/`.

### 3. Open the dashboard
Go to `https://YOUR-USERNAME.github.io/menu/admin.html`. Pick the sample restaurant **368**, or create a new one.
- **Restaurant Profile** – name, logo, address, phone, hours, description, WhatsApp, theme and accent colour, show/hide the public menu.
- **Manage Menu** – add / edit / delete items, upload photos, price and offer price, veg/non-veg, tags, Available ↔ Sold out. Deleting asks for confirmation.
- **Categories** – add, rename, reorder (arrows), delete.
- **QR Code** – stable link, **Download PNG**, **QR only**, **Print** (restaurant name on the card), **Copy link**.
- **Public Preview** – exactly what customers will see, updating live as you edit.

### 4. Create a GitHub token (once)
GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** → *Repository access:* only your menu repository → *Repository permissions → Contents: Read and write* → Generate → copy it (`github_pat_…`).

### 5. Publish
Dashboard → **Publish & Settings** → enter `your-username/menu`, branch `main`, paste the token → **Publish to GitHub**. Wait 1–2 minutes, then open the QR link.

*No token?* Use **Download update ZIP**, unzip it, and drag the `data` and `assets` folders into the repository on github.com (Add file → Upload files → Commit).

### 6. QR code
Open the dashboard **from your GitHub Pages address** (not from a local file), go to **QR Code**, and download or print. If you open the dashboard locally, set **Public site address** under *Publish & Settings* so the QR points at the real site.

### Run locally (optional)
```bash
cd qr-menu
python3 -m http.server 8000      # then open http://localhost:8000/admin.html
```
(Opening the HTML files by double-click will not work, because browsers block loading the JSON files from `file://`.)

### Updating later
Edit in the dashboard → **Publish**. To change the app itself (colours, fonts, layout), edit the files in `css/` or `js/` on GitHub (pencil icon) or re-upload them. A removed restaurant: delete its `data/<name>.json`, its `assets/<name>/` folder and its entry in `data/restaurants.json`.

## Free-tier limits and future costs
Figures below are GitHub's published limits as I know them — check GitHub Pages / API documentation for current values.
- GitHub Pages: free for public repositories; roughly 1 GB site size, ~100 GB/month soft bandwidth, soft limit of about 10 builds per hour. A text menu with ~100 KB photos serves thousands of scans comfortably.
- GitHub API (used for publishing): 5,000 requests/hour per token; each publish uses a handful of requests plus one per new image.
- Photos live in your repo — keep them small (the dashboard resizes automatically).
- Everything in a public repo is public (menu data and images are public anyway).
- Costs only appear if you want a custom domain (optional), a private repo with Pages (paid GitHub plan), or real owner logins / instant updates (Firebase/Supabase free tiers, then usage-based).

## Testing checklist
**Verified here (automated, simulated browser + mocked GitHub API):**
- [x] Customer menu renders all items grouped by category; veg/non-veg filter, search, category chips, empty state, “clear filters”.
- [x] Offer price (strike-through + % off), sold-out styling, unknown / invalid `?r=` shows “Menu not found”.
- [x] Dashboard: add / edit / delete item (with confirmation), price validation (negative, empty, offer ≥ price), tags, availability toggle, category add / duplicate check / rename / reorder / delete, profile validation, WhatsApp number normalisation.
- [x] Drafts survive in the browser; publish writes `data/<slug>.json` + `data/restaurants.json`, cleans up unused app-generated images, and keeps the logo and unrelated files; a wrong token shows a clear error and keeps the draft.
- [x] The generated QR card **decodes to the exact menu URL** (checked with a QR decoder); the update ZIP is a valid archive.

**Not tested — please check yourself before relying on it:**
- [ ] Real publishing to your GitHub repository with your token.
- [ ] Photo and logo upload/resizing in a real browser, and the visual layout on real Android and iPhone browsers.
- [ ] Scanning the downloaded / printed QR with a real phone camera; print layout.
- [ ] After publishing, change a price (e.g. ₹150 → ₹180), wait ~2 minutes, re-scan on a second phone and confirm the new price.
- [ ] Set the **Public site address** correctly and confirm the QR opens the right restaurant.
