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
- **Contact form** — server-validated, with honeypot spam prevention.
- **Dark mode** — via `prefers-color-scheme`.
- **Accessibility** — semantic HTML5, ARIA roles on tab/dialog widgets, keyboard
  navigation, visible focus states.

## Technologies used

- **HTML5 / CSS3** — semantic markup, one stylesheet (`public/css/main.css`) with
  design tokens in `:root`, dark mode via CSS custom properties.
- **JavaScript (ES6+)** — no transpile step, runs directly in evergreen browsers.
- **Leaflet + Mapbox** — interactive map with day/night tile sets.
- **Marked + DOMPurify** — client-side Markdown rendering, sanitised before insertion.
- **Luxon** — timezone-aware date handling (`Australia/Sydney`).
- **Azure Static Web Apps** (integrated HTTP-trigger Functions) — production proxy
  layer between the site and upstream data sources.
- **Azure Logic Apps** — backend workflows for the contact form and live fire data.

## Project structure

```
/
├── public/
│   ├── index.html            # Single page. Script load order matters (end of <body>).
│   ├── css/main.css          # One stylesheet; design tokens in :root
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
│   │   └── vendor/                # Luxon, Marked, DOMPurify (minified — don't edit)
│   └── Content/               # Editable content — see below
├── api/                       # Azure Functions — production proxy layer
├── server.js                  # Local Express mirror of api/ for local dev
├── infra/                     # Bicep IaC for the Static Web App
├── __tests__/                 # Jest unit tests
├── docs/                      # Documentation (see docs/README.md)
├── master_plan.md             # In-flight work tracker
└── CLAUDE.md / .github/copilot-instructions.md   # AI-agent conventions
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

Create `.env` from `.env.example`:

```bash
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here

AZURE_CONTACT_WEBHOOK_URL=https://prod-...
AZURE_INCIDENTS_WEBHOOK_URL=https://prod-...
AZURE_FIRE_DANGER_WEBHOOK_URL=https://prod-...

PORT=3000
ALLOWED_ORIGINS=https://bungendorerfs.org,https://www.bungendorerfs.org,http://localhost:3000
```

`AZURE_CALENDAR_WEBHOOK_URL` is also read by `server.js`/`api/calendar-events` but is
no longer used by the front end — events and training now come from static content
files (below), not a live calendar feed. It's safe to leave unset.

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

1. **Production (Azure Static Web Apps):** `api/<fn>/index.js` functions
   (`mapbox-token`, `fire-danger`, `fire-incidents`, `calendar-events`, `contact`) act
   as the proxy layer between the static site and Azure Logic Apps webhooks. This is
   the security boundary — credentials never reach the browser.
2. **Local dev:** `server.js` (Express) re-implements the same endpoints by reading
   `.env`. When an `api/<fn>/index.js` endpoint's contract changes, mirror the change
   in `server.js`.

All dynamic data (fire danger, incidents, contact form) flows through these proxy
endpoints. Community events, training, and BFDP dates are static files (above) and
need no backend call. See [`docs/API_INTEGRATION.md`](docs/API_INTEGRATION.md) for
full endpoint documentation.

## Security

- Every `innerHTML`/`insertAdjacentHTML` assignment is sanitised with DOMPurify.
- All form/API inputs are validated server-side in `api/<fn>/index.js`; client-side
  validation is UX only.
- Azure Logic Apps webhook URLs and the Mapbox token never reach client code —
  they're proxied server-side, and the Mapbox token endpoint validates origin.
- `.env` and `api/local.settings.json` are gitignored; never commit them.

See [`SECURITY_FIXES.md`](SECURITY_FIXES.md) for the remediation audit trail and
[`docs/API_INTEGRATION.md`](docs/API_INTEGRATION.md) for endpoint-level detail.

## Branching & contributing

Topic branch off `liveDev` → PR into `liveDev` → owner promotes `liveDev` → `main`.
Both `main` and `liveDev` are protected. Run `npm run build` locally before pushing.

CI (`.github/workflows/ci.yml`) runs ESLint, Jest with coverage, and an `npm audit`
gate on every push/PR into `main` or `liveDev`.

## Troubleshooting

**Server won't start** — check `.env` exists with required variables; verify
`node --version` >= 18; try `rm -rf node_modules && npm install`.

**Map not loading** — verify `MAPBOX_ACCESS_TOKEN` in `.env` and that the token
hasn't been revoked in your Mapbox account; check the browser console.

**Form submission fails** — check `AZURE_CONTACT_WEBHOOK_URL` in `.env` and that the
Azure Logic App is running; check server logs.

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
