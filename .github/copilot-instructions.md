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
├── current_state/              # As-built UI/UX spec + redesign-programme evidence (programme closed Aug 2026)
│   ├── ui-baseline.md          # Pre-redesign baseline snapshot + DOM-ID contract
│   ├── ui-redesign.md          # As-built "Command Centre" spec
│   ├── wireframe/index.html    # Self-contained interactive previews
│   └── images/                 # Screenshots
├── README.md                   # Documentation index
├── API_INTEGRATION.md          # Endpoints, Logic Apps, Azure OpenAI + Clarity contracts
├── TESTING.md                  # Jest + Testing-Library guide
└── CSS_OPTIMIZATION.md         # CSS architecture + dead-code sweeps
api/README.md                   # Function-by-function reference
infra/README.md                 # What the Bicep provisions (and what it doesn't)
SECURITY_FIXES.md               # Security remediation log (root, still appended to)
README.md                       # Project overview + setup + content-editing guide
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

| Branch                                    | Role                                              | Protected |
| ----------------------------------------- | ------------------------------------------------ | --------- |
| `main`                                    | Production. Deploys to the Azure Static Web App.  | Yes       |
| `feat/*`, `fix/*`, `chore/*`, `copilot/*` | Topic branches off `main`                         | No        |

**Workflow:** topic branch off `main` → PR into `main` → squash-merge after CI is
green. Reference the GitHub issue (`Fixes #N`) and link the relevant
`master_plan.md` entry. (An earlier `liveDev` integration branch no longer
exists — some older docs still mention it.)

**Commit / PR hygiene:** never write a `Claude-Session:` trailer or a "session" /
`claude.ai` link into a commit message or PR description — those are public and
leak internal session URLs. A `Co-Authored-By:` trailer is fine.

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

### Test infrastructure

- **Framework:** Jest 30 + jsdom + `@testing-library/dom` + `@testing-library/jest-dom` 7.
- **Location:** `__tests__/` at repo root. Suites: `admin-nav`, `clarity-insights`,
  `contact-notify`, `duty-alert`, `error-handler`, `members-auth`, `otp-email`, `validation`.
- **Config:** `jest.config.js` (jsdom env; `collectCoverageFrom` covers `public/js/**` + `server.js`).
- **Conventions:** colocate by responsibility, not by source path. For the shared
  `api/shared/` handlers, `jest.mock("../api/shared/store", …)` with an in-memory
  fake and set `global.fetch = jest.fn()` (see `members-auth.test.js`,
  `clarity-insights.test.js`). Render fragments instead of full HTML where practical.
- See [`docs/TESTING.md`](../docs/TESTING.md) for patterns.

### Lint & format

- ESLint config: `eslint.config.js` (flat config, ESLint 10). Prettier config: `.prettierrc.json`.
- CI runs `npm run lint` (blocking). It does **not** run Prettier — run
  `npm run format:check` locally before pushing.

### CI/CD

- Lint/test/audit gate: `.github/workflows/ci.yml`. Triggers on push to `main` and
  `copilot/**`, and PRs into `main`. Runs ESLint, `test:coverage`, and a
  moderate-or-higher `npm audit` gate (blocking).
- Deploy workflow: `.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml`.
  Triggers on `workflow_run` after CI completes (and on pull requests). Publishes
  `public/` as the app and `api/` as the managed Functions package.
- Dependabot: `.github/dependabot.yml`.

### Environment variables

`server.js` reads `.env` (copy from `.env.example`). The `api/` Functions runtime
reads `api/local.settings.json` (copy from `api/local.settings.example.json`) —
that file is the authoritative, complete list. Never commit either.

Groups: Mapbox (`MAPBOX_ACCESS_TOKEN`, `ALLOWED_ORIGINS`) · live fire data
(`AZURE_INCIDENTS_WEBHOOK_URL`, `AZURE_FIRE_DANGER_WEBHOOK_URL`) · ACS email —
contact form **and** sign-in codes (`ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS`,
`CONTACT_NOTIFY_TO`, `CONTACT_NOTIFY_CONFIRM`) · members' auth (`AUTH_JWT_SECRET`,
`BRFS_STORAGE_CONNECTION`, `AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`) ·
brigade phone (`DUTY_LOOKUP_KEY`, `DUTY_CLAIM_PIN`, `DUTY_FALLBACK_NUMBER`,
`DUTY_ALERT_TO`) · Social Studio AI (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`) · Analytics
(`CLARITY_API_TOKEN`).

---

## 4. Architecture (current state)

### Frontend (`public/`)

- Plain ES6+ JavaScript loaded via `<script defer>`. **No bundler.** Order matters — see `public/index.html` end of body.
- Vendored libs in `public/js/vendor/` (Luxon, Marked, DOMPurify). External via CDN: Mapbox GL JS (lazy-loaded when the map scrolls into view), Pico CSS, Font Awesome 6. Microsoft Clarity's analytics tag also loads on the public site.
- One stylesheet: `public/css/main.css`. CSS variables in `:root` drive theming and dark mode (`prefers-color-scheme`).
- Markdown content lives in `public/Content/` and is fetched + rendered client-side by `dynamicContent.js` through Marked + DOMPurify.

### Backend — two deployment targets, one codebase

1. **Production (Azure Static Web Apps):** functions in `api/` (`mapbox-token`,
   `fire-danger`, `fire-incidents`, `contact`, `auth-*`, `members`, `duty`,
   `content`, `enquiries`, `social-chat`, `social-prompt`, `clarity`) are the
   proxy layer / security boundary. Upstream services: Azure Logic Apps webhooks
   for fire data; Azure Communication Services Email for the contact form **and**
   members'-area sign-in codes; `brfsstorage` Table Storage for the members' area;
   Azure OpenAI for the Social Studio copy assistant; the Microsoft Clarity export
   API for the Analytics tab. Full reference: [`api/README.md`](../api/README.md).
2. **Local dev:** `server.js` (Express) serves `public/` and re-implements the same
   proxy endpoints by reading from `.env`. Keep the two surfaces semantically
   identical — when an `api/<fn>/index.js` changes its contract, mirror the change
   in `server.js`. Most logic already lives in `api/shared/` and is imported by both.

### Infrastructure

- `infra/main.bicep` provisions the SWA and a **subset** of app settings
  (`infra/parameters.example.json` is the template). Members'-area, Social Studio,
  and duty settings are managed directly on the Static Web App — see
  [`infra/README.md`](../infra/README.md).

---

## 5. Coding conventions

### Design intent — protect this

The UI is deliberately slick, modern, and information-rich, with emergency
information above everything else. When changing the front end, preserve:

- **Emergency-first hierarchy** — fire danger, active incidents, warning level,
  total fire ban, and the live map surface immediately (hero + `#liveStatusStrip`).
- **Polish** — smooth transitions, parallax, tabbed/accordion content, dark mode.
  Don't strip animations, focus outlines, or responsive behaviour to "simplify".
- **Density without clutter** — rich data presented cleanly; tabular numerics,
  iconography, colour-coded status. Match the existing visual language (`:root`
  tokens in `main.css`).
- **Accessibility is not optional** — semantic HTML5, ARIA on tab/dialog widgets,
  keyboard operability, meaningful `alt`. Never regress these.

The as-built spec is `docs/current_state/ui-redesign.md`; skim it before reworking layout.

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
scripts/                  # Table Storage seed scripts (seed-{member,duty,content,enquiries}.js)
package.json
jest.config.js
eslint.config.js / .prettierrc.json
```

### Dependencies

- Keep the surface minimal. Justify new deps in the PR description.
- `npm audit` clean before merging dependency PRs (Dependabot files them automatically).

---

## 6. Repository-specific quirks

### Token replacement

- `replace-token.js` runs as `prestart` and substitutes `MAP_TOKEN_PLACEHOLDER` in `public/js/main.js` for local dev.
- In production the token is fetched at runtime from the SWA `mapbox-token` function (with origin validation).
- **Do not log the token** anywhere — see [`SECURITY_FIXES.md`](../SECURITY_FIXES.md) for the past regression this fixed.

### Live status strip

The UI Redesign programme (issue #56, closed Aug 2026) consolidated the home
page's previously duplicated emergency surfaces (header bar, expanded overlay,
mobile panel, in-page card) into a single live status strip (`#liveStatusStrip`),
managed by `public/js/emergency-dashboard.js`. The legacy ID-alias shim was
removed. Treat the canonical IDs in
[`docs/current_state/ui-baseline.md` §5](../docs/current_state/ui-baseline.md) as
the contract for any JS reading/writing status-strip state.

### Assets

- Favicon files live in the repo root (and `public/`) for proper browser discovery.
- `public/Images/` holds site images. The hero uses the `hero4-*` set (WebP with a
  JPEG fallback, separate desktop/mobile assets), preloaded in `index.html`.
- Dark mode is CSS-driven via `prefers-color-scheme`. The logo swap
  (`logo.png` ↔ `logo-dark.png`) is the only image asset that varies by theme.

---

## 7. Security

The CRITICAL items from earlier reviews have been addressed: Logic Apps URLs are now server-side in `api/*`, the contact form has spam prevention + validation, the mapbox-token endpoint validates origins. `SECURITY_FIXES.md` also carries an August 2026 members'-area review (rate limiting, session invalidation, duty-key checks). See it for the full trail.

Secrets now in play, all Application settings / `.env` only, never in code:
Logic App webhook URLs, `MAPBOX_ACCESS_TOKEN`, `ACS_CONNECTION_STRING`,
`AUTH_JWT_SECRET`, `BRFS_STORAGE_CONNECTION`, `DUTY_LOOKUP_KEY` / `DUTY_CLAIM_PIN`,
`AZURE_OPENAI_API_KEY`, `CLARITY_API_TOKEN`.

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

| Task                                  | Where                                              |
| ------------------------------------- | -------------------------------------------------- |
| Plan / track work                     | [`master_plan.md`](../master_plan.md)              |
| Per-phase specs & acceptance criteria | `docs/current_state/<topic>.md`                    |
| Run tests                             | `npm test`                                         |
| Lint + format                         | `npm run lint && npm run format:check`             |
| Pre-merge gate (local)                | `npm run build`                                    |
| Add/change a proxy endpoint           | `api/<fn>/index.js` **and** mirror in `server.js`  |
| Add new docs                          | `docs/<NAME>.md` (never recreate `Documentation/`) |
| Security audit trail                  | [`SECURITY_FIXES.md`](../SECURITY_FIXES.md)        |

---

Update this file in the same PR whenever a convention changes (tokens, scripts,
branch policy, doc layout) — see §1.
