# Bungendore Volunteer Rural Fire Brigade Website

The public website for the Bungendore Volunteer Rural Fire Brigade (NSW RFS Southern
Ranges district). It surfaces fire danger ratings, a live incident map, bushfire
preparation guidance, membership information, and brigade/community events.

Plain **ES6+ JavaScript** loaded with `<script defer>` — no bundler, no framework, one
stylesheet, markdown content rendered client-side.

## Features

- **Emergency-first home page** — fire danger rating, active incident count, and a
  live map surface above the fold, backed by a "Command Centre" layout (see
  [`docs/current_state/ui-redesign.md`](docs/current_state/ui-redesign.md)).
- **Interactive map** — real-time NSW RFS fire incidents filtered to local council
  areas, colour-coded by alert level.
- **Bushfire Danger Period indicator** — driven by an editable content file, see
  [Editing site content](#editing-site-content-no-code-required) below.
- **Events & training schedule** — community events and recurring brigade training
  sessions, sourced from static content files (no external calendar dependency).
- **Contact form** — server-validated, with honeypot spam prevention; submissions
  are emailed to the committee and recorded for the members' area.
- **Members' area** (`/admin`) — passwordless email-code sign-in for
  `@rfs.nsw.gov.au` addresses on an allow-list. Runs the brigade duty-phone
  number, the events & training editor, an enquiries list, **Social Studio** (a
  canvas graphic-template editor + an Azure OpenAI copy-drafting assistant), and
  an **Analytics** tab (Microsoft Clarity usage stats).
- **Dark mode** — via `prefers-color-scheme`.
- **Accessibility** — semantic HTML5, ARIA roles on tab/dialog widgets, keyboard
  navigation, visible focus states.

## Technologies used

- **HTML5 / CSS3** — semantic markup, one stylesheet (`public/css/main.css`) with
  design tokens in `:root`, dark mode via CSS custom properties.
- **JavaScript (ES6+)** — no transpile step, runs directly in evergreen browsers.
- **Mapbox GL JS** — interactive map, lazy-loaded when it scrolls into view.
- **Marked + DOMPurify** — client-side Markdown rendering, sanitised before insertion.
- **Luxon** — timezone-aware date handling (`Australia/Sydney`).
- **Azure Static Web Apps** (integrated HTTP-trigger Functions) — production proxy
  layer between the site and upstream data sources.
- **Azure Communication Services Email** — sends the contact-form notification and
  the members'-area sign-in codes (sender domain `notify.bungendorerfs.org`).
- **Azure Table Storage** (`brfsstorage`) — members' area: allow-list, sign-in
  codes, audit log, duty number, editable content, enquiries, Clarity snapshots.
- **Azure OpenAI** — the Social Studio copy assistant (a GPT-5 reasoning deployment).
- **Microsoft Clarity** — privacy-respecting web analytics on the public site;
  the members'-area Analytics tab reads its Data Export API.
- **Azure Logic Apps** — backend workflows for the live fire-danger and incident feeds.

## Project structure

```
/
├── public/
│   ├── index.html            # Single page. Script load order matters (end of <body>).
│   ├── css/main.css          # One stylesheet; design tokens in :root
│   ├── admin.html            # Members' area (noindex)
│   ├── js/
│   │   ├── main.js               # Fire danger fetch/render, orchestration
│   │   ├── map.js                # Interactive map (lazy-loaded on scroll into view)
│   │   ├── contact.js            # Contact form
│   │   ├── calendar.js           # Events + training schedule rendering
│   │   ├── tabs-accordion.js     # Tab/accordion widget (roving tabindex)
│   │   ├── emergency-dashboard.js# Live status strip state
│   │   ├── dynamicContent.js     # Markdown content loader
│   │   ├── error-handler.js      # Shared error/loading UI helpers
│   │   ├── modal-utils.js        # Shared modal helpers
│   │   ├── admin.js              # Whole members' area (auth, duty, content, enquiries, Social Studio, Analytics)
│   │   └── vendor/                # Luxon, Marked, DOMPurify (minified — don't edit)
│   └── Content/               # Editable content — see below
├── api/                       # Azure Functions proxy layer (~15 functions — see api/README.md)
│   └── shared/                # Cross-backend logic imported by both api/ and server.js
├── server.js                  # Local Express mirror of api/ for local dev
├── scripts/                   # Table Storage seed scripts
├── infra/                     # Bicep IaC for the Static Web App
├── __tests__/                 # Jest unit tests
├── docs/                      # Documentation (see docs/README.md)
├── master_plan.md             # In-flight work tracker
└── CLAUDE.md / .github/copilot-instructions.md   # AI-agent conventions (kept in sync)
```

## Getting started

### Prerequisites

- Node.js >= 18.0.0
- npm

### Setup

```bash
git clone https://github.com/richardthorek/bungendorerfsorg2.0.git
cd bungendorerfsorg2.0
npm install
cp .env.example .env
# edit .env — see Environment configuration below
npm start
```

Open `http://localhost:3000`.

### Environment configuration

Copy `.env.example` to `.env` and fill it in — it has every variable with an
inline comment. Groups:

- **Mapbox** — `MAPBOX_ACCESS_TOKEN`, optional `ALLOWED_ORIGINS`.
- **ACS Email** (contact form + sign-in codes) — `ACS_CONNECTION_STRING`,
  `ACS_SENDER_ADDRESS`, `CONTACT_NOTIFY_TO`, `CONTACT_NOTIFY_CONFIRM`.
- **Members' auth** — `AUTH_JWT_SECRET`, `BRFS_STORAGE_CONNECTION` (Azurite
  string locally), `AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`.
- **Brigade phone** — `DUTY_LOOKUP_KEY`, `DUTY_CLAIM_PIN`, `DUTY_FALLBACK_NUMBER`,
  `DUTY_ALERT_TO` (all optional locally).
- **Live fire data** — `AZURE_INCIDENTS_WEBHOOK_URL`, `AZURE_FIRE_DANGER_WEBHOOK_URL`.
- **Social Studio AI** — `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
  `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`.
- **Analytics** — `CLARITY_API_TOKEN` (optional).
- `PORT` (default 3000).

`server.js` reads `.env`. The real Functions runtime (`cd api && func start`)
reads `api/local.settings.json` instead — copy it from
`api/local.settings.example.json`.

Events and the training schedule are edited in the members' area (`/admin`) and
stored in `brfsstorage`; the home page reads them from `/api/content/events` and
`/api/content/training`, falling back to the bundled JSON files if the API is
unreachable. The old Microsoft 365 calendar feed (`api/calendar-events`,
`AZURE_CALENDAR_WEBHOOK_URL`, the `getCalendar` Logic App) has been removed.

**Never commit `.env`.** It holds live credentials.

## Editing site content (no code required)

Everything below lives in `public/Content/` as plain JSON or Markdown. Edit the file,
commit, and open a PR — there's no build step and no code to touch.

### Bush Fire Danger Period dates

**File:** `public/Content/bfdpDates.json`

```json
{
  "start": "2026-10-01",
  "end": "2027-03-31"
}
```

Dates are `YYYY-MM-DD`. The statutory default is 1 Oct – 31 Mar, but the NSW RFS
Commissioner can vary it per district for a given year. Check the authoritative table
at [rfs.nsw.gov.au/fire-information/BFDP](https://www.rfs.nsw.gov.au/fire-information/BFDP)
and update `start`/`end` by hand when it changes. If this file is missing or fails to
load, `isBushfireDangerPeriod()` in `main.js` falls back to the statutory default.

### Fire danger rating messaging

**File:** `public/Content/AFDRSMessages.json`

The live rating (NONE/MODERATE/HIGH/EXTREME/CATASTROPHIC) is fetched from the NSW RFS
feed at runtime — this file only supplies the copy and colours shown alongside it
(`KeyMessage`, `FireBehaviour`, `SupportingMessages`, `color`/`background-color`). Edit
an entry's text if the RFS updates its official messaging; don't add or rename
`Rating` values unless the RFS feed's rating names change too.

### Community events

**File:** `public/Content/communityEvents.json`

```json
[
  {
    "name": "Bungendore Show",
    "timing": "Date TBC",
    "description": "The brigade attends with a truck and crew for community engagement and fire safety education."
  }
]
```

`timing` is free text — a firm date, a season, or "Date TBC". Add, remove, or edit
entries directly; order in the file is the display order.

### Training schedule

**File:** `public/Content/trainingSchedule.json`

```json
[
  {
    "title": "Training Night",
    "recurrence": "second-saturday",
    "time": "9:00 AM – 12:00 PM",
    "location": "Bungendore RFS Station"
  }
]
```

`recurrence` is `<ordinal>-<weekday>` (ordinals: `first`…`fifth`, `last`) or
`every-<weekday>` for weekly sessions. `calendar.js` computes each session's next
occurrence from this pattern automatically — you never date-stamp individual
sessions, and the schedule never goes stale.

### Page copy (Markdown)

**Files:** `public/Content/prepareContent.md`, `fireInfoContent.md`,
`membershipContent.md`, `eventsContent.md`

Plain Markdown, rendered client-side (Marked, sanitised with DOMPurify) into the
matching tab on the home page. Edit directly — headings, lists, links, and tables all
work as standard Markdown.

## Development

```bash
npm start             # localhost:3000 (prestart runs replace-token.js, then server.js)
npm run dev           # server only, skip token replacement
npm test               # Jest
npm run test:watch
npm run test:coverage
npm run lint           # ESLint over public/js, server.js, replace-token.js
npm run lint:fix
npm run format          # Prettier write
npm run format:check
npm run build           # lint + test:coverage — the local pre-merge gate
```

See [`docs/TESTING.md`](docs/TESTING.md) for testing patterns.

### Infrastructure (IaC)

```bash
az group create --name BungendoreRFS --location eastasia
cp infra/parameters.example.json infra/parameters.json
az deployment group create \
   --resource-group BungendoreRFS \
   --template-file infra/main.bicep \
   --parameters @infra/parameters.json
```

See `infra/README.md` for details.

## Architecture

Two backend targets share one contract:

1. **Production (Azure Static Web Apps):** the ~15 `api/<fn>/index.js` functions
   are the proxy layer / security boundary between the static site and upstream
   services — Azure Logic Apps for fire data, Azure Communication Services for
   email, `brfsstorage` Table Storage and Azure OpenAI and Microsoft Clarity for
   the members' area. Credentials never reach the browser.
2. **Local dev:** `server.js` (Express) re-implements the same endpoints by reading
   `.env`. When an `api/<fn>/index.js` endpoint's contract changes, mirror the
   change in `server.js`. Most logic lives in `api/shared/`, imported by both.

Community events, training, and BFDP dates are static files (above) and need no
backend call. Full endpoint, Logic Apps, Azure OpenAI, and Clarity documentation:
[`docs/API_INTEGRATION.md`](docs/API_INTEGRATION.md); per-function reference:
[`api/README.md`](api/README.md).

## Security

- Every `innerHTML`/`insertAdjacentHTML` assignment is sanitised with DOMPurify.
- All form/API inputs are validated server-side; client-side validation is UX only.
- No upstream secret reaches client code — Logic App webhook URLs, the Mapbox
  token, the ACS connection string, storage keys, the Azure OpenAI key and the
  Clarity token are all proxied server-side. The Mapbox endpoint validates origin.
- Members'-area sessions are short-lived signed cookies; sign-out / disable /
  role change invalidates them immediately.
- `.env` and `api/local.settings.json` are gitignored; never commit them.

See [`SECURITY_FIXES.md`](SECURITY_FIXES.md) for the remediation audit trail and
[`docs/API_INTEGRATION.md`](docs/API_INTEGRATION.md) for endpoint-level detail.

## Branching & contributing

Topic branch (`feat/*`, `fix/*`, `chore/*`) off `main` → PR into `main` →
squash-merge once CI is green. `main` is the only protected branch. Run
`npm run build` locally before pushing.

CI (`.github/workflows/ci.yml`) runs ESLint, Jest with coverage, and a
moderate-or-higher `npm audit` gate on every push to `main` / `copilot/**` and
every PR into `main`. Deployment is a separate workflow that runs after CI passes.

## Troubleshooting

**Server won't start** — check `.env` exists with required variables; verify
`node --version` >= 18; try `rm -rf node_modules && npm install`.

**Map not loading** — verify `MAPBOX_ACCESS_TOKEN` in `.env` and that the token
hasn't been revoked in your Mapbox account; check the browser console.

**Form submission fails** — check `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS` and
`CONTACT_NOTIFY_TO` in `.env`, and that the `notify.bungendorerfs.org` domain is
Verified in the `stationkit-comm` Communication Services resource; check server logs.

**Events/training not showing** — validate the JSON in `public/Content/*.json`; a
malformed file will fail to parse and the section will show its empty-state message.

See [`docs/API_INTEGRATION.md`](docs/API_INTEGRATION.md) for more.

## Documentation

Full index: [`docs/README.md`](docs/README.md). Conventions and quirks for anyone
(human or AI agent) working in this repo: [`.github/copilot-instructions.md`](.github/copilot-instructions.md).
In-flight work tracker: [`master_plan.md`](master_plan.md).

## License

For the Bungendore Volunteer Rural Fire Brigade community's use.

## Contact

- Open a GitHub issue for bugs/features.
- Repository owner: [@richardthorek](https://github.com/richardthorek).
