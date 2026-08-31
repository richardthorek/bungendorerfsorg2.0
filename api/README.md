# Azure Functions API

The production backend for the Bungendore RFS website, deployed as the managed
Functions package inside the Azure Static Web App. Every function is a proxy /
security boundary: upstream credentials (Logic App webhook URLs, the Mapbox
token, the ACS connection string, storage keys, the Azure OpenAI key, the
Clarity token) never reach the browser.

`server.js` at the repo root is an Express mirror of these endpoints for local
dev — **any change to an `api/<fn>/index.js` contract must be mirrored there.**
Most logic lives in `api/shared/` and is imported by both backends.

## Functions

Each function is its own directory with `index.js` + `function.json`.

| Directory | Route | Purpose |
| --- | --- | --- |
| `mapbox-token/` | `GET /api/mapbox-token` | Returns the Mapbox token, origin-validated |
| `fire-danger/` | `GET /api/fire-danger` | Proxies the fire-danger XML feed (Logic App) |
| `fire-incidents/` | `GET /api/fire-incidents` | Proxies the incidents GeoJSON (Logic App) |
| `contact/` | `POST /api/contact` | Contact-form submit: validates, records to the `enquiries` table, emails the committee DL via ACS (`submit.js` + `notify.js`) |
| `auth-request/` | `POST /api/auth/request` | Members' area: email a one-time sign-in code (ACS) |
| `auth-verify/` | `POST /api/auth/verify` | Verify the code, issue the 60-min session cookie |
| `auth-me/` | `GET /api/auth/me` | Current session; also fires an opportunistic Clarity refresh |
| `auth-logout/` | `POST /api/auth/logout` | Clear the session, bump `tokenVersion` |
| `members/` | `GET/POST /api/members`, `DELETE /api/members/{email}` | Allow-list admin (admins only) |
| `duty/` | `GET /api/duty`, `GET /api/duty/status`, `POST /api/duty`, `POST /api/duty/claim` | Brigade-phone forwarding number (public lookup + members set/claim) |
| `content/` | `GET/PUT /api/content/{key}` | Editable home-page content (`events`, `training`) in the `content` table |
| `enquiries/` | `GET /api/enquiries`, `PATCH`/`DELETE /api/enquiries/{id}` | Contact-form submissions list (members only) |
| `social-chat/` | `POST /api/social/chat` | Social Studio AI copy assistant — one `chatTurn` per message, returns `{message, draft}` |
| `social-prompt/` | `GET/PUT /api/social/prompt` | Admin-editable voice/rules prompt (`content` table, `settings` partition) |
| `clarity/` | `GET /api/clarity/insights` | Microsoft Clarity analytics snapshot + daily-rollup history |

`api/shared/` holds the cross-backend logic: `handlers.js` (all members'-area
handlers), `auth.js` / `identity.js` (sessions, allow-list), `store.js` (Table
Storage), `otpEmail.js` (ACS sign-in code), `aiCopy.js` (Azure OpenAI),
`clarityInsights.js` (Clarity export API), `phone.js`, `dutyAlert.js`,
`contentSchema.js`, `functionAdapter.js`.

## Environment variables

Set these as **Application settings** on the Static Web App (Configuration blade).
The authoritative list with dev-friendly values is
[`local.settings.example.json`](local.settings.example.json).

| Setting | Used by |
| --- | --- |
| `MAPBOX_ACCESS_TOKEN` | `mapbox-token` |
| `ALLOWED_ORIGINS` | `mapbox-token` origin allow-list (optional) |
| `AZURE_FIRE_DANGER_WEBHOOK_URL`, `AZURE_INCIDENTS_WEBHOOK_URL` | `fire-danger`, `fire-incidents` |
| `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS` | contact email + sign-in codes |
| `CONTACT_NOTIFY_TO`, `CONTACT_NOTIFY_CONFIRM` | `contact` |
| `AUTH_JWT_SECRET`, `AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES` | members'-area auth |
| `BRFS_STORAGE_CONNECTION` | all Table Storage (`brfsstorage` in prod) |
| `DUTY_LOOKUP_KEY`, `DUTY_CLAIM_PIN`, `DUTY_FALLBACK_NUMBER`, `DUTY_ALERT_TO` | `duty` |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | `social-chat` |
| `CLARITY_API_TOKEN` | `clarity` (optional — tab shows "not connected" without it) |

Removed: `AZURE_CONTACT_WEBHOOK_URL` (contact moved to ACS) and
`AZURE_CALENDAR_WEBHOOK_URL` / the `calendar-events` function (events + training
are now edited in the members' area, stored in the `content` table).

## Local development

Prefer `npm start` from the repo root — it runs `server.js`, which mirrors every
endpoint above and reads `.env`.

To run the real Functions runtime instead:

```bash
npm install -g azure-functions-core-tools@4
cp api/local.settings.example.json api/local.settings.json   # then fill in real values
cd api && func start        # http://localhost:7071/api/...
```

`local.settings.json` is gitignored — never commit it.

## Deployment

Deployed automatically by
`.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml`, which runs
on `workflow_run` after the CI workflow completes (and on pull requests). It
publishes `public/` as the app and `api/` as the managed Functions package.

## Security

- Every function validates input server-side; client validation is UX only.
- Origin validation + CORS on `mapbox-token`; honeypot + rate limiting on `contact`.
- All upstream secrets are Application settings, never in code or the repo.
- Members'-area sessions are short-lived signed cookies; `tokenVersion` on the
  member row invalidates them on sign-out / disable / role change.
- See [`../SECURITY_FIXES.md`](../SECURITY_FIXES.md) and
  [`../docs/API_INTEGRATION.md`](../docs/API_INTEGRATION.md).
