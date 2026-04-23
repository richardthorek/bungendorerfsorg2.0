# GitHub Copilot Instructions — Bungendore RFS Website 2.0

Single source of truth for how Copilot (and human contributors) work in this repository. Keep this file accurate; if a convention changes in a PR, update this file in the same PR.

---

## 1. Planning model — start here every time

**All in-flight work is tracked in [`master_plan.md`](../master_plan.md) at the repo root.** Before starting any non-trivial task:

1. Open `master_plan.md`. Find the active programme that the request belongs to (or add one if it's net-new).
2. Read the linked spec doc(s) under `docs/current_state/` for the target state.
3. Implement against the per-phase acceptance criteria already written there.
4. Update `master_plan.md` in the same PR — flip phase status, add PR link, note blockers, record done items.

If the request is a one-off (typo, doc tweak, dependency bump), skip the plan; otherwise it goes through the plan.

### Documentation layout

```
master_plan.md                  # Single source of truth for in-flight work
docs/                           # All project documentation (consolidated; was Documentation/)
├── current_state/              # Live state for active programmes
│   ├── ui-baseline.md          # Quantified pre-change baseline
│   ├── ui-redesign.md          # Target spec + per-PR acceptance criteria
│   ├── wireframe/index.html    # Self-contained interactive previews
│   └── images/                 # Screenshots (baseline + after)
├── REVIEW_SUMMARY.md           # Codebase review — exec summary
├── CODEBASE_REVIEW.md          # Codebase review — full
├── QUICK_FIXES.md              # Codebase review — checklist
├── API_INTEGRATION.md          # Azure Functions / Logic Apps integration
├── TESTING.md                  # Jest + Testing-Library guide
├── ASSET_ORGANIZATION.md       # Images & icons
├── CSS_OPTIMIZATION.md         # CSS architecture
├── IMPLEMENTATION_SUMMARY.md   # Historical change log (do not modify)
├── UI_UX_IMPROVEMENTS_PROPOSAL.md
└── UI_UX_IMPLEMENTATION_SUMMARY.md
SECURITY_FIXES.md               # Security remediation log (root, kept for visibility)
README.md                       # Project overview + setup
```

> The legacy capital-D `Documentation/` directory has been consolidated into lowercase `docs/`. Do not recreate `Documentation/`.

### When you make changes

- Update `master_plan.md` for any scope/status change.
- Add new state docs under `docs/current_state/<topic>.md` and link them from `master_plan.md`.
- Update `README.md` only when setup, scripts, or top-level architecture change.
- Update this file (`.github/copilot-instructions.md`) when conventions change (tokens, scripts, branch policy).
- Do **not** spawn ad-hoc summary markdowns in the repo root; put them in `docs/`.

---

## 2. Branching & PRs

| Branch | Role | Protected |
|--------|------|-----------|
| `main` | Production. Auto-deploys to Azure Static Web Apps. | Yes — owner merges from `liveDev` only |
| `liveDev` | Integration / staging. Permanent preview URL. | Yes — PRs require review |
| `copilot/*`, `feature/*` | Topic branches off `liveDev` | No |

**Workflow:** topic branch off `liveDev` → PR into `liveDev` → owner promotes `liveDev` → `main`. Reference the GitHub issue (`Fixes #N`) and link the relevant `master_plan.md` phase. One PR per phase where possible.

---

## 3. Build, test, CI/CD

### Local

```bash
npm install
npm start            # http://localhost:3000  (runs prestart token replace, then server.js)
npm run dev          # server only
npm test             # Jest
npm run test:watch
npm run test:coverage
npm run lint         # ESLint over public/js, server.js, replace-token.js
npm run lint:fix
npm run format       # Prettier write
npm run format:check
npm run build        # lint + test:coverage (CI-style gate)
```

### Test infrastructure (now exists)

- **Framework:** Jest + jsdom + `@testing-library/dom` + `@testing-library/jest-dom`.
- **Location:** `__tests__/` at repo root. Current files: `error-handler.test.js`, `validation.test.js`.
- **Config:** `jest.config.js`.
- **Conventions:** colocate by responsibility, not by source path. Prefer Testing-Library queries; mock `fetch` for API tests; render fragments instead of full HTML where practical.
- See [`docs/TESTING.md`](../docs/TESTING.md) for patterns.

### Lint & format (now exists)

- ESLint config: `.eslintrc.json`. Prettier config: `.prettierrc.json`.
- Run `npm run lint` and `npm run format:check` before pushing. CI does not yet enforce these — running them locally avoids review-cycle churn.

### CI/CD

- Workflow: `.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml`.
- Triggers: push to `main` / `liveDev`, PRs into `main`.
- Deploys static site (`public/`) **and** the integrated API (`api/`) to Azure Static Web Apps.
- Dependabot: `.github/dependabot.yml`.
- **Gap:** the SWA workflow doesn't yet run `npm run build` (lint + tests). Adding that gate is on the roadmap; until then run it locally.

### Environment variables

Copy `.env.example` to `.env`. Required for full local function:

```
MAPBOX_ACCESS_TOKEN=...
AZURE_CONTACT_WEBHOOK_URL=...
AZURE_CALENDAR_WEBHOOK_URL=...
AZURE_INCIDENTS_WEBHOOK_URL=...
AZURE_FIRE_DANGER_WEBHOOK_URL=...
PORT=3000
```

Local dev for the Azure Functions in `api/` uses `api/local.settings.json` (template: `api/local.settings.example.json`); never commit the real one.

---

## 4. Architecture (current state)

### Frontend (`public/`)

- Plain ES6+ JavaScript loaded via `<script defer>`. **No bundler.** Order matters — see `public/index.html` end of body.
- Vendored libs in `public/js/vendor/` (Luxon, Marked, DOMPurify). External: Mapbox GL, Leaflet, Pico CSS, Font Awesome via CDN.
- One stylesheet: `public/css/main.css`. CSS variables in `:root` drive theming and dark mode (`prefers-color-scheme`).
- Markdown content lives in `public/Content/` and is fetched + rendered client-side by `dynamicContent.js` through Marked + DOMPurify.

### Backend — two deployment targets, one codebase

1. **Production (Azure Static Web Apps):** functions in `api/` (`mapbox-token`, `fire-danger`, `fire-incidents`, `calendar-events`, `contact`) act as the proxy layer between the static site and Azure Logic Apps webhooks. This is where the security boundary lives.
2. **Local dev:** `server.js` (Express) serves `public/` and re-implements the same proxy endpoints by reading from `.env`. Keep the two surfaces semantically identical — when an `api/<fn>/index.js` changes its contract, mirror the change in `server.js`.

### Infrastructure

- `infra/main.bicep` provisions the SWA + app settings; `infra/parameters.example.json` is the template.

---

## 5. Coding conventions

### JavaScript

- ES6+, no transpile step → write code that runs in evergreen browsers (Node 18+ for tests).
- **Always sanitise:** every `innerHTML =` or `insertAdjacentHTML` goes through `DOMPurify.sanitize(...)`. Tests in `__tests__/` should assert this for new helpers.
- **Always validate at boundaries:** server-side input validation in the Azure Functions (`api/contact/index.js` is the reference); never trust the client.
- **Fetch API** for HTTP. Wrap network errors with `error-handler.js` so the user sees a useful message.
- Keep functions small and pure where the DOM allows. Don't add abstractions for one-off operations.

### CSS

- Component-scoped rules; tokens centralised in `:root` (see `public/css/main.css` top). When changing tokens, update `docs/CSS_OPTIMIZATION.md`.
- Mobile-first. Dark mode via CSS custom properties + `prefers-color-scheme`.
- Avoid global rules on broad selectors (e.g. `article:hover`) — they leak into footer/modal contexts. Scope to component classes.

### HTML / Accessibility

- Semantic HTML5: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`. Reserve `<article>` for self-contained syndicated content (not generic boxes).
- Provide `aria-label` on interactive groups; ensure tab/dialog widgets are keyboard-operable (arrow keys for tablists, Escape for dialogs).
- Visible focus indicators are mandatory; do not strip outlines.
- All images need meaningful `alt` text (or `alt=""` if decorative).

### File organisation

```
.github/                  # Workflows, dependabot, copilot-instructions.md
__tests__/                # Jest tests
api/                      # Azure Functions (production proxy layer)
docs/                     # All documentation (see §1)
infra/                    # Bicep IaC
public/                   # Static site (deployed root)
  ├── Content/            # Markdown sources
  ├── Images/             # Site assets (favicons live in repo root for browser discovery)
  ├── css/main.css
  ├── js/                 # Plain JS modules + vendor/
  ├── index.html
  └── staticwebapp.config.json
master_plan.md            # In-flight work tracker
SECURITY_FIXES.md         # Security remediation log
server.js                 # Local-dev Express server
replace-token.js          # Build-time Mapbox token substitution into main.js
package.json
jest.config.js
.eslintrc.json / .prettierrc.json
```

### Dependencies

- Keep the surface minimal. Justify new deps in the PR description.
- `npm audit` clean before merging dependency PRs (Dependabot files them automatically).

---

## 6. Repository-specific quirks

### Token replacement

- `replace-token.js` runs as `prestart` and substitutes `MAP_TOKEN_PLACEHOLDER` in `public/js/main.js` for local dev.
- In production the token is fetched at runtime from the SWA `mapbox-token` function (with origin validation).
- **Do not log the token** anywhere — past regression (CODEBASE_REVIEW Issue #3).

### Two emergency / status surfaces (transitional)

The home page currently has duplicated emergency surfaces (header bar, expanded overlay, mobile panel, in-page card). The UI Redesign programme (issue #56) consolidates these into a single live status strip. **While that programme is in flight, treat the IDs listed in [`docs/current_state/ui-baseline.md` §5](../docs/current_state/ui-baseline.md) as a stable contract** — JS that reads/writes those IDs must keep working.

### Favicons

- Favicon files live in repo root (and `public/`) for proper browser discovery. See [`docs/ASSET_ORGANIZATION.md`](../docs/ASSET_ORGANIZATION.md).

### Dark mode

- CSS-driven via `prefers-color-scheme`. Logo swap (`logo.png` ↔ `logo-dark.png`) is the only image asset that varies.

---

## 7. Security

The CRITICAL items from earlier reviews have been addressed: Logic Apps URLs are now server-side in `api/*`, the contact form has spam prevention + validation, the mapbox-token endpoint validates origins. See [`SECURITY_FIXES.md`](../SECURITY_FIXES.md) for the audit trail.

### Standing rules

- **Never commit secrets.** `.env`, `api/local.settings.json`, and any `*.local.*` files are gitignored — keep them that way.
- **Sanitise every `innerHTML`** with DOMPurify. No exceptions.
- **Validate all inputs server-side** in `api/<fn>/index.js`. Client validation is UX, not security.
- **Don't expose internals in error messages.** Log details server-side; show users a friendly string.
- **Origin-validate any new token / proxy endpoint** the same way `api/mapbox-token/index.js` does.
- Review against OWASP Top 10 for any new endpoint.

### Per-PR security checklist

- [ ] No secrets in code, commits, or test fixtures
- [ ] All new `innerHTML` / `insertAdjacentHTML` uses DOMPurify
- [ ] All new form/API inputs validated server-side
- [ ] Error responses don't leak stack traces, env names, or upstream URLs
- [ ] New endpoints have origin validation and (where appropriate) rate limiting
- [ ] `npm audit` clean for any new dependency

---

## 8. Contact & ownership

- **Owner:** [@richardthorek](https://github.com/richardthorek)
- **Org:** Bungendore Volunteer Rural Fire Brigade
- Code issues → GitHub issues. Security issues → contact owner directly. Doc questions → `docs/`.

---

## 9. Quick reference

| Task | Where |
|------|-------|
| Plan / track work | [`master_plan.md`](../master_plan.md) |
| Per-phase specs & acceptance criteria | `docs/current_state/<topic>.md` |
| Run tests | `npm test` |
| Lint + format | `npm run lint && npm run format:check` |
| Pre-merge gate (local) | `npm run build` |
| Add/change a proxy endpoint | `api/<fn>/index.js` **and** mirror in `server.js` |
| Add new docs | `docs/<NAME>.md` (never recreate `Documentation/`) |
| Security audit trail | [`SECURITY_FIXES.md`](../SECURITY_FIXES.md) |

---

**Document version:** 2.0  
**Last updated:** 2026-04-23 (consolidated `Documentation/` → `docs/`; reflected current Azure Functions, test infra, lint/format tooling; established `master_plan.md` as the planning anchor)
