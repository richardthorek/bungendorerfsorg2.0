# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository. Keep this
file **lean** — it is loaded into context every session. Deep detail lives in the
linked docs; read those on demand rather than duplicating them here.

## What this is

The website for the **Bungendore Volunteer Rural Fire Brigade** — a public,
community-facing site delivering fire danger ratings, live incident maps, bushfire
preparation guidance, membership info, and events. **No bundler, no framework**:
plain ES6+ JavaScript loaded with `<script defer>`, one stylesheet, markdown content
rendered client-side.

The single source of truth for conventions is
[`.github/copilot-instructions.md`](.github/copilot-instructions.md) — **read it before
any non-trivial change.** This file is the quick orientation; that file is the rulebook.

## Design intent — protect this

The UI is deliberately **slick, modern, and information-rich**, with emergency
information prioritised above all else. When changing the front end, preserve:

- **Emergency-first hierarchy** — fire danger, active incidents, warning level, total
  fire ban, and the live map surface immediately (hero + `#liveStatusStrip`).
- **Polish** — smooth transitions, parallax, tabbed/accordion content, dark mode via
  `prefers-color-scheme`. Don't strip animations, focus outlines, or responsive behaviour.
- **Density without clutter** — rich data presented cleanly; tabular numerics, iconography,
  colour-coded status. Match the existing visual language (tokens in `:root` of `main.css`).
- **Accessibility** — semantic HTML5, ARIA roles on tab/dialog widgets, keyboard operability,
  meaningful `alt` text. Never regress these.

Before reworking layout, skim the design specs in `docs/` (see index below).

## Repository map (read targets, not the whole tree)

| Area | Path | Notes |
|------|------|-------|
| Entry page | `public/index.html` | Single page. Script load order matters (end of `<body>`). |
| Front-end JS | `public/js/*.js` | `main.js` (fire danger/orchestration), `map.js`, `contact.js`, `calendar.js`, `tabs-accordion.js`, `emergency-dashboard.js`, `error-handler.js`, `modal-utils.js`, `dynamicContent.js` |
| Vendored libs | `public/js/vendor/` | Luxon, Marked, DOMPurify (minified — **don't read/edit**) |
| Styles | `public/css/main.css` | One stylesheet; design tokens in `:root` |
| Content | `public/Content/` | Markdown + JSON rendered client-side |
| Prod API | `api/<fn>/index.js` | Azure Functions proxy layer (security boundary) |
| Local dev server | `server.js` | Express mirror of the API for local dev — keep in sync with `api/` |
| Tests | `__tests__/` | Jest + jsdom |
| Infra | `infra/main.bicep` | Azure Static Web Apps IaC |
| Docs index | `docs/README.md` | Map of all documentation |
| Plan tracker | `master_plan.md` | In-flight work; update for non-trivial changes |

## Commands

```bash
npm install
npm start            # localhost:3000 (prestart runs replace-token.js, then server.js)
npm test             # Jest
npm run test:coverage
npm run lint         # ESLint over public/js, server.js, replace-token.js
npm run format:check # Prettier
npm run build        # lint + test:coverage — the local pre-merge gate
```

## Non-negotiables

- **Sanitise every `innerHTML` / `insertAdjacentHTML`** with `DOMPurify.sanitize(...)`. No exceptions.
- **Validate inputs server-side** in `api/<fn>/index.js`; client validation is UX only.
- **Two backends, one contract:** changing an `api/<fn>/index.js` endpoint means mirroring it in `server.js`.
- **Never commit secrets** (`.env`, `api/local.settings.json`). **Never log the Mapbox token.**
- **Don't leak internals** in error responses; log server-side, show users a friendly string.
- Plain ES6+ that runs in evergreen browsers — no transpile step, no new build tooling without justification.

## Branching

Topic branch off `liveDev` → PR into `liveDev` → owner promotes to `main`.
`main` and `liveDev` are protected. Run `npm run build` locally before pushing.

## Where to look for more

- Conventions & quirks → [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
- Documentation index → [`docs/README.md`](docs/README.md)
- API/integration → `docs/API_INTEGRATION.md`
- UI/UX intent → `docs/current_state/ui-redesign.md` (current target-state spec), `docs/current_state/ui-baseline.md`
- CSS architecture → `docs/CSS_OPTIMIZATION.md`
- Testing → `docs/TESTING.md`
- Security trail → `SECURITY_FIXES.md`
