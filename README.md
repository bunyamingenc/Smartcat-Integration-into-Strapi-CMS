# LocaleSync

**A translation management dashboard connecting Strapi CMS with Smartcat**

LocaleSync bridges the gap between headless CMS content and professional TMS workflows. Register articles, push content to Smartcat, monitor per-language translation progress in real time, and pull completed translations back into Strapi — all from a single dashboard, with no manual copy-paste.

---

## Screenshots

**Articles — card view with per-locale progress bars**
![Articles Card View](docs/screenshot-articles.png)

**Locale matrix — full translation coverage at a glance**
![Locale Matrix](docs/screenshot-matrix.png)

**Article detail modal — locale status, XLIFF download/upload, diff view**
![Article Modal](docs/screenshot-modal.png)

**Activity log — full audit trail of every pipeline action**
![Activity Log](docs/screenshot-activity.png)

---

## Features

| Feature | Description |
|---|---|
| **Multi-article registry** | Register any Strapi article against any Smartcat project using their IDs |
| **Send to Smartcat** | Push `title`, `shortDescription`, `body` to Smartcat in one click |
| **Diff view** | Shows field-level changes since last send before pushing |
| **Pull to Strapi** | Import completed (or partial) translations back to Strapi locale versions |
| **XLIFF 1.2 support** | Download/upload `.xlf` files per locale — compatible with MemoQ, Trados, OmegaT, Phrase |
| **Locale matrix view** | Table of articles × locales showing progress at a glance |
| **Locale parity check** | Detects mismatches between Strapi and Smartcat locales |
| **Initialize locales** | Copy source content into empty Strapi locale entries in one click |
| **Bulk operations** | Select multiple articles and send/pull them all at once |
| **Activity log** | Paginated audit trail of every send, pull, XLIFF action, and locale sync |
| **Multi-project support** | Each article is linked to its own Smartcat project independently |
| **Credential management** | All API keys stored in browser localStorage — nothing hardcoded on server |

---

## Architecture

```
React Dashboard (Vite + React 18)
         ↕  REST API
Express Middleware (Node.js)
    ↕                   ↕
Strapi CMS v5       Smartcat API v1
(content source)    (translation engine)
```

The Express server is **credential-agnostic** — all API keys are sent as request headers from the browser. Nothing is hardcoded on the server side, making the tool usable by anyone with their own Strapi and Smartcat accounts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, vanilla CSS with custom properties |
| API server | Node.js, Express |
| CMS | Strapi v5 |
| Translation platform | Smartcat API v1 |
| File format | XLIFF 1.2 (zero dependencies, custom serializer/parser) |
| Credential storage | Browser localStorage |
| Article registry | JSON file (server-side) |
| Activity log | JSONL append-only file |

---

## Project Structure

```
localesync/
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── App.css
│       ├── api/
│       │   └── client.js              # All API calls + credential management
│       └── components/
│           ├── ArticlesPage.jsx       # Article grid with bulk selection
│           ├── ArticleModal.jsx       # Register · send · pull · XLIFF · locale sync
│           ├── DiffModal.jsx          # Field-level diff before sending
│           ├── LocaleMatrix.jsx       # Articles × locales table
│           ├── LocaleSyncModal.jsx    # Strapi ↔ Smartcat locale parity
│           ├── ActivityPage.jsx       # Paginated activity timeline
│           ├── Header.jsx
│           ├── Settings.jsx
│           ├── StatusBadge.jsx
│           └── Toast.jsx
│
├── middleware/
│   ├── server.js                      # Express API — all endpoints
│   ├── activityLog.js                 # JSONL activity logger
│   ├── xliff.js                       # XLIFF 1.2 serializer/parser
│   ├── transform.js                   # Field mapping + placeholder validation
│   ├── jobTracker.js                  # Legacy CLI job state
│   └── sync.js                        # Legacy CLI pipeline runner
│
└── strapi-cms/                        # Local Strapi v5 instance
```

---

## Getting Started

### Prerequisites

- Node.js v20, v22, or v24
- A running Strapi v5 instance with i18n enabled
- A Smartcat account with at least one project containing uploaded documents

### 1. Clone the repo

```bash
git clone https://github.com/bunyamingenc/Smartcat-Integration-with-Strapi-CMS.git
cd Smartcat-Integration-with-Strapi-CMS
```

### 2. Start the API server

```bash
cd middleware
npm install
node server.js
```

Runs at `http://localhost:3000`

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

### 4. Start Strapi (separate terminal)

```bash
cd strapi-cms
npm run develop
```

Runs at `http://localhost:1337`

### 5. Configure credentials

Open **Settings** in the dashboard and fill in:

**Strapi:**
| Field | Where to find it |
|---|---|
| Strapi URL | Your Strapi instance URL |
| API Token | Strapi Admin → Settings → API Tokens → Full access |
| Content Type | Plural API ID (e.g. `articles`, `test-articles`) |
| Source Locale | Default language code (e.g. `en`) |

**Smartcat:**
| Field | Where to find it |
|---|---|
| Server URL | `https://smartcat.ai` or `https://eu.smartcat.ai` |
| Account ID | Smartcat → Settings → API |
| API Key | Smartcat → Settings → API → Generate key |

### 6. Register your first article

1. Click **+ Add Article**
2. Paste the **Strapi document ID** — from the article URL in Strapi Admin
3. Paste the **Smartcat project ID** — from the project URL: `smartcat.com/projects/{ID}/files`
4. Click **Register article** — the app validates both IDs before saving

### 7. Full workflow

```
Register article
    ↓
Review & Send → (diff view shows what changed)
    ↓
Translators work in Smartcat
    ↓
Monitor progress (per-locale %, live)
    ↓
↓ Pull to Strapi (writes translated locale versions)
```

---

## XLIFF Workflow

Each locale row in the article modal has two buttons:

- **↓** — downloads a `.xlf` file ready for MemoQ, Trados, OmegaT, or Phrase
- **↑** — uploads a translated `.xlf` file and writes it directly to Strapi

This works independently of Smartcat — useful when translators prefer desktop CAT tools.

---

## Locale Sync

The **⚙ Locale Sync** button in the article modal shows a parity report:

```
✓ In both Strapi & Smartcat:   EN  TR  ES  RU
⚠ Strapi only:                 PT
ℹ Smartcat only:               DE  AR
```

Actions available:
- **Initialize empty locales** — copies source content into all empty Strapi locale entries
- **Add article entries for existing locales** — creates article entries for Smartcat languages already added to Strapi globally

> Note: Strapi v5 does not allow creating global locales via API. New languages must be added manually in Strapi Admin → Settings → Internationalization first.

---

## Known Limitations

- **Global locale creation** — Strapi v5 restricts this to the admin panel only.
- **File formats** — currently supports JSON and XLIFF 1.2. XLIFF 2.0 and TMX are not yet supported.
- **Rich text blocks** — Strapi's block editor format is not supported. Use Long text fields instead.

---

## Roadmap

- [ ] Deploy to Railway + Vercel (publicly usable)
- [ ] PostgreSQL registry
- [ ] QA report after pull (placeholder validation, HTML tag integrity)
- [ ] Pseudo-localization mode
- [ ] Webhook auto-send on Strapi publish
- [ ] XLIFF 2.0 support
- [ ] Translation memory leverage stats

---

[github.com/bunyamingenc](https://github.com/bunyamingenc)

---

## License

MIT
