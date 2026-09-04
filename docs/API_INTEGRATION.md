# API Integration Documentation

This document describes all API integrations used in the Bungendore RFS website.

---

## Table of Contents

- [Overview](#overview)
- [Server-Side Proxy Endpoints](#server-side-proxy-endpoints) — contact, events/training, fire incidents, fire danger, health check, mapbox token, members' area, brigade phone
- [Social Studio — Azure OpenAI copy assistant](#social-studio--azure-openai-copy-assistant)
- [Analytics — Microsoft Clarity](#analytics--microsoft-clarity)
- [Azure Logic Apps Integration](#azure-logic-apps-integration)
- [External APIs](#external-apis)
- [Environment Configuration](#environment-configuration)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)

---

## Overview

The Bungendore RFS website uses a combination of server-side proxy endpoints and external APIs to provide real-time fire safety information and community engagement features.

**Architecture:**

```
Frontend (public site  ·  /admin members' area)
  ↓
Static Web Apps integrated API — HTTP-trigger Azure Functions in api/
(mirrored by server.js for local dev; shared logic in api/shared/)
  ↓
Azure Logic Apps (fire data)  ·  ACS Email  ·  brfsstorage Table Storage
Azure OpenAI (Social Studio)  ·  Microsoft Clarity export API (Analytics)
```

---

## Server-Side Proxy Endpoints

All API calls from the frontend go through server-side proxy endpoints to protect API credentials and enable server-side validation.

### 1. Contact Form Submission

**Endpoint:** `POST /api/contact`

**Purpose:** Validate a contact-form submission and email the committee
distribution list (plus an acknowledgement to the enquirer) via Azure
Communication Services Email.

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "0412345678",
  "message": "Your message here"
}
```

**Validation:**

- Name: 2-100 characters
- Email: Valid email format
- Phone: Optional, Australian phone format if provided
- Message: 10-2000 characters
- Honeypot check: `website` field must be empty

**Response (Success):**

```json
{
  "success": true,
  "message": "Thank you for your submission"
}
```

**Response (Validation Error):**

```json
{
  "error": "Validation failed",
  "details": ["Name must be at least 2 characters long"]
}
```

**Backend Logic:**

1. Checks honeypot field for spam (silently returns success if `website` is set)
2. Validates form data
3. Sanitizes data (trims whitespace, lowercase email)
4. Sends a rich HTML notification to `CONTACT_NOTIFY_TO` via ACS Email, with the
   enquirer set as `Reply-To` so the committee can reply directly
5. Best-effort: sends the enquirer an acknowledgement email (skipped when
   `CONTACT_NOTIFY_CONFIRM=false`; a failure here does not fail the request)
6. Returns `{ success: true }` to the client

`api/contact/submit.js` (shared with `server.js`) does two things with each
validated submission: **records it in the `enquiries` table** and emails
`CONTACT_NOTIFY_TO`. It succeeds if at least one worked. Members action the list
at `/admin → Enquiries`. No SharePoint, Teams, or Logic App in this path.

---

### 2. Community events & training schedule

Edited in the members' area (`/admin` → Events & training) and stored in
`brfsstorage`. `public/js/calendar.js` renders the two home-page widgets from:

- `GET /api/content/events` — array of `{ name, timing, description }`
- `GET /api/content/training` — array of `{ title, recurrence, time, location }`;
  `calendar.js` computes each item's next occurrence client-side from `recurrence`
  (`every-friday`, `second-saturday`, …) using Luxon in `Australia/Sydney`.

If the API is unreachable it falls back to the bundled `/Content/*.json` files,
which also seed the tables (`node scripts/seed-content.js`). The `content` table
endpoints are documented with the rest of the members' area in
[§6](#6-members-area-sign-in--allow-list).

The old Microsoft 365 calendar feed — `api/calendar-events`,
`AZURE_CALENDAR_WEBHOOK_URL`, and the `getCalendar` Logic App — has been removed.

---

### 3. Fire Incidents (Map Data)

**Endpoint:** `GET /api/fire-incidents`

**Purpose:** Fetch current fire incidents for map display

**Headers:**

- `X-Request-ID: Get-Fire-Incidents`
- `Content-Type: application/json`

**Response (GeoJSON):**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [149.443, -35.258]
      },
      "properties": {
        "title": "Bush Fire",
        "category": "Watch and Act",
        "description": "ALERT LEVEL: Watch and Act\nLOCATION: Near Bungendore\n..."
      }
    }
  ]
}
```

**Frontend Processing:**

1. Filters features by council area (Queanbeyan-Palerang, ACT)
2. Categorizes by alert level (Advice, Watch and Act, Emergency Warning)
3. Creates map markers with appropriate icons
4. Populates incident table

**Freshness headers:** the proxy keeps an in-memory last-known-good cache
(`api/shared/fireDataProxy.js`) and serves it — clearly marked — if the live
upstream fetch fails. Every response carries `X-Data-Freshness: fresh|stale`
and `X-Data-Age-Seconds: <n>`. Cache older than 30 minutes is not served; the
endpoint errors instead (an hours-old incident count during an active fire is
worse than an honest failure).

---

### 4. Fire Danger Rating

**Endpoint:** `GET /api/fire-danger`

**Purpose:** Fetch current fire danger rating for Southern Ranges district

**Response (XML):**

```xml
<Districts>
  <District>
    <Name>Southern Ranges</Name>
    <DangerLevelToday>MODERATE</DangerLevelToday>
    <FireBanToday>No</FireBanToday>
  </District>
</Districts>
```

**Frontend Processing:**

1. Parses XML using DOMParser
2. Finds "Southern Ranges" district
3. Matches danger level with `/Content/AFDRSMessages.json` for:
   - Color coding
   - Fire behavior message
   - Key safety message
4. Displays in fire danger section

**Freshness headers:** same last-known-good cache and `X-Data-Freshness` /
`X-Data-Age-Seconds` headers as `/api/fire-incidents` above — see
`api/shared/fireDataProxy.js`.

---

### 3a. Health Check

**Endpoint:** `GET /api/health`

**Purpose:** Public, unauthenticated liveness probe for an external uptime
monitor (the monitor itself is configured outside this repo).

**Response:**

```json
{ "status": "ok", "timestamp": "2026-08-31T10:00:00.000Z" }
```

`status` is `"degraded"` (still HTTP 200 — the body carries the signal, not
the status code) when the fire-data upstream looks unreachable. The check
reuses `fireDataProxy`'s own fetch/cache path rather than issuing a second
independent upstream request, so polling this endpoint doesn't add extra load
beyond what `/api/fire-danger` already causes.

---

### 5. Mapbox Token

**Endpoint:** `GET /api/mapbox-token`

**Purpose:** Provide the Mapbox access token with origin validation.

**Origin validation:** the request `Origin` (or `Referer` origin) must match the
allow-list in `api/mapbox-token/index.js` — the apex and `www.bungendorerfs.org`,
`http://localhost:3000`, the SWA production and preview hostnames, plus regex
patterns for numbered preview environments and Codespaces. Requests with no
origin (same-origin) are allowed. The `ALLOWED_ORIGINS` env var is an optional
additional allow-list. Keep this list, `SECURITY_FIXES.md`, and the code in agreement.

**Response:** `{ "token": "pk.ey..." }`

**Usage:** Mapbox GL JS map tiles and rendering (day/night styles), lazy-loaded
when the map scrolls into view.

---

### 6. Members' area (sign-in + allow-list)

**Page:** `/admin` (served from `public/admin.html`; `noindex`). Plain-JS dashboard
shell — sign-in, then **Brigade phone** (§7), **Enquiries** (§1), **Events &
training** (§2), **Social Studio** (Azure OpenAI copy assistant), **Analytics**
(Microsoft Clarity) and **Members** (admin only). Backend logic is shared:
`api/shared/handlers.js` is used by
`api/{auth-*,members,duty,content,enquiries,social-chat,social-prompt,clarity}`
and mirrored in `server.js`.

**Sign-in** is passwordless. A person may sign in only if BOTH:

1. their email is on `AUTH_ALLOWED_EMAIL_DOMAIN` (`rfs.nsw.gov.au`), and
2. their email is a row in the `members` table (the allow-list) and not disabled.

| Endpoint                                        | Notes                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/request` `{email}`              | Emails a 6-digit code via ACS (10-min, single-use, 5-attempt lock). Always returns `{ok:true}` — never reveals whether the address is a member. Rate-limited per email (3/15 min) and per IP. |
| `POST /api/auth/verify` `{email,code}`          | On success sets `brfs_session` — an HS256 JWT, `HttpOnly; Secure; SameSite=Lax`, **60-min** expiry (`AUTH_SESSION_MINUTES`).                                                                  |
| `GET /api/auth/me`                              | `{email,name,role,expiresAt}` or 401. Re-checks the `members` row every call, so disabling a member or bumping `tokenVersion` logs them out at once.                                          |
| `POST /api/auth/logout`                         | Clears the cookie and bumps `tokenVersion` so the token can't be replayed.                                                                                                                    |
| `GET /api/members`                              | Admin only. `{members:[…]}`                                                                                                                                                                   |
| `POST /api/members` `{email,displayName,role}`  | Admin only. Adds/updates an allow-list entry (must be an `@rfs.nsw.gov.au` address). Requires header `X-BRFS-Auth: 1`.                                                                        |
| `DELETE /api/members/{email}`                   | Admin only. Ends the member's session and removes them. Refuses to remove the last admin. Requires `X-BRFS-Auth: 1`.                                                                          |
| `GET /api/content/{events\|training}`           | Public. Returns the plain array the home-page widgets consume.                                                                                                                                |
| `PUT /api/content/{events\|training}` `{items}` | Members only, `X-BRFS-Auth: 1`. Validates and replaces the whole list; audits `content_updated`.                                                                                              |
| `GET /api/enquiries`                            | Members only. All contact-form submissions, newest first, with status + notes.                                                                                                                |
| `PATCH /api/enquiries/{id}` `{status?, note?}`  | Members only, `X-BRFS-Auth: 1`. `status` ∈ new / in-progress / resolved; a note is appended with the member's name + time; first move off `new` records `handledBy`.                          |
| `DELETE /api/enquiries/{id}`                    | Admin only, `X-BRFS-Auth: 1`. For spam.                                                                                                                                                       |
| `POST /api/social/chat` `{messages, …}`         | Members only, `X-BRFS-Auth: 1`. One Social Studio turn — see [Social Studio](#social-studio--azure-openai-copy-assistant).                                                                    |
| `GET/PUT /api/social/prompt`                    | `GET` members / `PUT` admin, `X-BRFS-Auth: 1`. The editable voice/rules prompt (`content` table, `settings` partition).                                                                       |
| `GET /api/clarity/insights`                     | Members only. Stored Clarity snapshot + daily history — see [Analytics](#analytics--microsoft-clarity).                                                                                       |
| `POST /api/clarity/cron`                        | Machine only, `X-Cron-Secret`. Scheduled Clarity pull — see [Analytics](#analytics--microsoft-clarity).                                                                                       |

**Storage:** Azure Storage tables in `brfsstorage` (`BRFS_STORAGE_CONNECTION`),
created on first use — `members`, `authcodes`, `ratelimits`, `auditlog`, `duty`,
`content` (also holds the `settings` partition for the Social Studio prompt),
`enquiries`, `analytics` (Clarity snapshots).

**Seeding old enquiries:** `node scripts/seed-enquiries.js <file.json>` — an array
of `{name, message, email?, phone?, receivedAt?, legacyRef?}`, de-duplicated by
`legacyRef`. See `scripts/data/enquiries-seed.example.json` for the shape (placeholder data).

**First admin:** there's no self-serve bootstrap. Seed it once:

```bash
BRFS_STORAGE_CONNECTION="<brfsstorage connection string>" \
  node scripts/seed-member.js richardthorek-vol@rfs.nsw.gov.au "Richard Thorek" admin
```

**Config:** `AUTH_JWT_SECRET` (≥32 chars), `BRFS_STORAGE_CONNECTION`,
`AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`, `ACS_CONNECTION_STRING` /
`ACS_SENDER_ADDRESS` (the same ACS resource as the contact form). Social Studio
additionally needs `AZURE_OPENAI_*`; the Analytics tab needs `CLARITY_API_TOKEN`.

---

### 7. Brigade phone (call / SMS forwarding number)

Replaces the SharePoint lookup the Twilio Studio flow used to find the forwarding
number. Same `{ "Main": "+61…" }` contract, so the Twilio "Make HTTP Request"
widgets only need their URL changed. ("Brigade phone" in the UI — "duty" reads as
the district duty officer; routes and the `duty` table keep the old name.)

| Endpoint                              | Notes                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/duty`                       | Public — the Twilio flow calls this. Returns `{ "Main": "+61…" }`. If `DUTY_LOOKUP_KEY` is set, the caller must send it — `X-Duty-Key` header **or** `?key=` query param. Missing record → 503 so Twilio falls through to its own backup number.                                                                                        |
| `GET /api/duty/status`                | Members only. `{ number, label, masked, setBy, setByName, method, setAt, contacts[] }` — `contacts` is the deduped list of previously-used `{number, label}` (current excluded) for one-click re-set.                                                                                                                                   |
| `POST /api/duty` `{number, label?}`   | Members only, `X-BRFS-Auth: 1`. `label` is a free-text name ("Sandi Love"). Validates an AU number, stores it with the label, appends history + audit + change-alert email.                                                                                                                                                             |
| `POST /api/duty/claim` `{From, Body}` | Twilio SMS webhook. `BRIGADE <pin>` / `DUTY <pin>` → forward to the sender's number; `OFF <pin>` → revert to `DUTY_FALLBACK_NUMBER`. Anything else → `{handled:false}` so Twilio forwards the text normally. Needs `DUTY_CLAIM_PIN`; honours `X-Duty-Key`; rate-limited per sender. Attributed to a member if their `phone` is on file. |

**Storage:** table `duty` in `brfsstorage` (RK `current` + `h:<reverse-ts>` history).
Members may carry an optional `phone` for SMS attribution.

**Config:** `DUTY_LOOKUP_KEY`, `DUTY_CLAIM_PIN`, `DUTY_FALLBACK_NUMBER`,
`DUTY_ALERT_TO` (opt-in — no alert email unless set).

**Cut-over (Twilio Studio GUI):**

1. `node scripts/seed-duty.js +61…` — set the current number.
2. Widgets `phoneNumbers` (calls) and `phoneNumbers2` (SMS): **REQUEST URL** →
   `https://www.bungendorerfs.org/api/duty`, **METHOD** → `GET`; put the key in the URL: `…/api/duty?key=<DUTY_LOOKUP_KEY>` (simpler than a header in Studio).
3. SMS-PIN (optional): before `phoneNumbers2`, add a **Split Based On…**
   `{{trigger.message.Body}}` widget — if it matches `^(?i)(brigade|duty|off)\b`,
   route to a new **Make HTTP Request** (`POST` to `/api/duty/claim?key=<DUTY_LOOKUP_KEY>`, body
   `From={{trigger.message.From}}&Body={{trigger.message.Body}}`, header
   `X-Duty-Key`), then a **Send Message** with `{{widgets.<name>.parsed.reply}}`;
   otherwise fall through to the existing forward.
4. Retire `phoneNumberForwarding` and the `prod-00` SMS-lookup Logic App.

---

## Social Studio — Azure OpenAI copy assistant

Social Studio (`/admin → Social Studio`) has two halves: a client-only canvas
graphic-template editor (PNG export, nothing persisted server-side) and an AI
copy-drafting assistant backed by **Azure OpenAI**. Only the AI half touches the
backend.

**Endpoint:** `POST /api/social/chat` (members only, `X-BRFS-Auth: 1`), body
`{ messages: [{ role, text, image? }], … }`. `image` is a downscaled data-URL
(≤ ~3 MB, PNG/JPEG/WebP) — vision requires a vision-capable deployment.

**Per turn** the handler calls `chatTurn()` in `api/shared/aiCopy.js` — **one**
Azure OpenAI round trip that returns `{ message, draft }`:

- `message` — the conversational reply (questions, guidance, push-back). Never
  contains the post copy itself.
- `draft` — the live post: `{ headline, caption, hashtags[], flags[] }`, refined
  every turn once there's enough to propose. `flags` combines the model's own
  self-flags with a **fixed server-side keyword scan** (`RISK_PATTERNS` in
  `aiCopy.js`) for casualties / addresses / evacuation language / political or
  commercial content — this scan always runs regardless of the editable prompt.

**Request contract** (`callAzureChat`, `api/shared/aiCopy.js`): the deployment is
a GPT-5 reasoning model (prod: `gpt-5.6-terra`), so the call sends
`max_completion_tokens` + `reasoning_effort` (`"low"`) and a
`response_format: { type: "json_object" }` — **not** `temperature` / `max_tokens`,
which GPT-5 reasoning models reject. Default `AZURE_OPENAI_API_VERSION` is
`2024-10-21` (the GA version verified for `json_object` + vision).

**Editable prompt:** `GET/PUT /api/social/prompt` reads/writes the admin-editable
voice & rules text, stored in the `content` table under the `settings` partition.
`GET` is members, `PUT` is admin-only. The default lives in
`DEFAULT_SYSTEM_PROMPT` in `aiCopy.js` (grounded in NSW RFS Service Standard
1.4.5). Posting itself is always copy/paste into Meta Business Suite — there is no
Graph API integration.

**Config:** `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`.

---

## Analytics — Microsoft Clarity

The public site loads the Microsoft Clarity analytics tag
(`public/index.html`, project `yaxo089b41`). The members'-area **Analytics** tab
reads Clarity's **Data Export API** — deliberately _not_ on `admin.html`, so
member PII is never captured in session replays.

**Endpoint:** `GET /api/clarity/insights` (members only). Returns the stored
snapshot (`sessions`, `pages/session`, scroll depth, engagement, top pages,
friction signals) plus a daily-rollup history and a `configured` flag.
`?refresh=1` forces a pull within the daily budget.

**The constraint:** Clarity's export API only serves the last 1–3 days and allows
**10 calls / project / day**. So `api/shared/clarityInsights.js`:

- fetches at most once every `REFRESH_INTERVAL_MS` (6 h) and never more than
  `MAX_FETCHES_PER_DAY` (9) times per UTC day — one call held in reserve under
  Clarity's 10;
- is driven by a **scheduled cron hit** (below) for the regular cadence, plus
  **opportunistically** off members'-area traffic as a top-up: `maybeRefreshClarity()`
  is fire-and-forgotten from `handleAuthMe` (every members'-area page load) and from
  the Analytics panel; the refresh slot is claimed in storage _before_ the
  network call so concurrent loads don't stampede;
- normalises Clarity's per-metric response into a stable summary and persists it
  in the `analytics` table: a `latest` row + one `day:<yyyy-mm-dd>` rollup row
  per day, so the members'-area trend outlives Clarity's own 3-day retention.

**Config:** `CLARITY_API_TOKEN` (Clarity → Settings → Data Export → Generate
token). Optional — the tab shows a "not connected" state when unset.

**Scheduled pull:** `POST /api/clarity/cron` is a machine-only endpoint (not
member-authenticated) that forces a `maybeRefreshClarity()` call, guarded by a
shared secret — the caller must send `X-Cron-Secret` matching the
`CLARITY_CRON_SECRET` app setting, or the endpoint returns 401. It exists so
the `analytics` table gets a regular snapshot independent of whether any
member happens to log in that day — opportunistic-only refresh means a quiet
week in the portal is a quiet week in the trend data, even though Clarity
itself keeps recording visitors the whole time.

Wired up via `infra/modules/clarity-cron.bicep` — an Azure Logic App with a
**Recurrence** trigger (every 6h / 4x a day, UTC) → **HTTP** action, `POST` to
`/api/clarity/cron` with `X-Cron-Secret` matching `CLARITY_CRON_SECRET`. See
`infra/README.md` § "Scheduled Clarity pull" for the deploy command. 4
scheduled pulls + headroom for opportunistic/manual refreshes keeps the total
comfortably under Clarity's 10/project/day cap even if a member's
Analytics-tab refresh lands in the same window as a cron fire. The admin
panel's manual Refresh button stays as an on-demand override on top of this,
not a replacement for it.

---

## Azure Logic Apps Integration

Azure Logic Apps provides the serverless backend for:

1. Fire incident data aggregation
2. Fire danger rating XML feed

(The contact form no longer uses Logic Apps — it sends email directly via Azure
Communication Services. See [Contact Form Submission](#1-contact-form-submission).)

### Configuration

Each Logic App has a unique HTTP trigger URL with SAS signature:

```
https://prod-XX.australiaeast.logic.azure.com/workflows/[WORKFLOW_ID]/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=[PERMISSIONS]&sv=1.0&sig=[SIGNATURE]
```

**Security:**

- URLs are stored in `.env` file (not in source code)
- Server-side only (never exposed to client)
- Can be regenerated via Azure Portal if compromised

### Environment Variables

The **complete** list, with dev values and inline comments, is
[`../api/local.settings.example.json`](../api/local.settings.example.json) (for
`api/`) and [`../.env.example`](../.env.example) (for `server.js`). Summary by
feature:

| Feature                               | Variables                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Live fire data (Logic Apps)           | `AZURE_INCIDENTS_WEBHOOK_URL`, `AZURE_FIRE_DANGER_WEBHOOK_URL`                                         |
| Map                                   | `MAPBOX_ACCESS_TOKEN`, `ALLOWED_ORIGINS` (optional)                                                    |
| ACS email (contact + sign-in codes)   | `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS`, `CONTACT_NOTIFY_TO`, `CONTACT_NOTIFY_CONFIRM`           |
| Members' auth                         | `AUTH_JWT_SECRET`, `BRFS_STORAGE_CONNECTION`, `AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`      |
| Brigade phone                         | `DUTY_LOOKUP_KEY`, `DUTY_CLAIM_PIN`, `DUTY_FALLBACK_NUMBER`, `DUTY_ALERT_TO`                           |
| Social Studio AI                      | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` |
| Analytics                             | `CLARITY_API_TOKEN`, `CLARITY_CRON_SECRET` (scheduled pull, optional)                                  |
| App Insights (API function telemetry) | `APPLICATIONINSIGHTS_CONNECTION_STRING` (optional locally; see `infra/README.md`)                      |

Obsolete (removed): `AZURE_CONTACT_WEBHOOK_URL` (contact → ACS),
`AZURE_CALENDAR_WEBHOOK_URL` (calendar feed removed).

---

## External APIs

### NSW RFS Fire Danger API

**Source:** NSW Rural Fire Service
**Data:** Fire danger ratings by district (XML format)
**Update Frequency:** Daily
**Accessed via:** Azure Logic Apps proxy

### NSW RFS Incidents Feed

**Source:** NSW Rural Fire Service
**Data:** Current fire incidents (GeoJSON)
**Update Frequency:** Real-time
**Accessed via:** Azure Logic Apps proxy

### Mapbox

**Source:** Mapbox
**Data:** Map tiles + GL styles (day/night mode)
**Authentication:** access token, fetched at runtime from `/api/mapbox-token`
**Usage:** Mapbox GL JS map (lazy-loaded)

### Azure OpenAI

**Data:** the Social Studio copy assistant — see
[Social Studio](#social-studio--azure-openai-copy-assistant).

### Microsoft Clarity

**Data:** public-site web analytics; the Analytics tab reads the Data Export API
— see [Analytics](#analytics--microsoft-clarity).

---

## Environment Configuration

### Required Variables

See the table under [Azure Logic Apps Integration → Environment Variables](#environment-variables)
and the two example files it links. `server.js` loads `.env`; the `api/` Functions
runtime loads `api/local.settings.json`.

### Production Deployment

1. **Azure Static Web Apps:**
   - Set environment variables in Configuration
   - Ensure all `AZURE_*` URLs are current
   - Rotate URLs if they've been exposed

2. **Testing Environment:**
   - Use test/staging Logic Apps URLs
   - Keep production credentials separate

---

## Error Handling

### Server-Side Error Responses

All proxy endpoints return standardized error responses:

**Configuration Error (500):**

```json
{
  "error": "Server configuration error"
}
```

**Upstream Error (500):**

```json
{
  "error": "Failed to fetch events"
}
```

**Validation Error (400):**

```json
{
  "error": "Validation failed",
  "details": ["Error message 1", "Error message 2"]
}
```

### Frontend Error Handling

- Uses `error-handler.js` utility
- Shows user-friendly messages
- Provides retry options
- Logs detailed errors to console

---

## Security Considerations

### Best Practices

1. **Never expose credentials in client-side code**
   - All API keys and webhook URLs are server-side only
   - Use environment variables

2. **Validate all inputs**
   - Client-side validation (user experience)
   - Server-side validation (security)
   - Sanitize data before forwarding

3. **Implement spam prevention**
   - Honeypot field in forms
   - Rate limiting (future enhancement)
   - CAPTCHA (optional future enhancement)

4. **Use HTTPS everywhere**
   - All external API calls use HTTPS
   - Enforced by Azure Static Web Apps

5. **Origin validation**
   - Mapbox token endpoint checks origin
   - Prevents unauthorized use

6. **Regular security updates**
   - Run `npm audit` regularly
   - Update dependencies monthly
   - Rotate API credentials if exposed

### Credential Rotation

If a credential is compromised, regenerate it at the source and update the Static
Web App Application settings (and your local `.env` / `api/local.settings.json`):

| Credential                           | Where to rotate                                                            |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `AZURE_*_WEBHOOK_URL`                | Azure Portal → Logic App → workflow → Access keys → regenerate SAS         |
| `MAPBOX_ACCESS_TOKEN`                | Mapbox account → Tokens → new token with domain restriction, revoke old    |
| `ACS_CONNECTION_STRING`              | ACS resource (`stationkit-comm`) → Keys → regenerate                       |
| `AUTH_JWT_SECRET`                    | Generate a new ≥32-char random string (invalidates all live sessions)      |
| `BRFS_STORAGE_CONNECTION`            | Storage account (`brfsstorage`) → Access keys → rotate                     |
| `DUTY_LOOKUP_KEY` / `DUTY_CLAIM_PIN` | Pick new values; update the Twilio flow's URL / PIN too                    |
| `AZURE_OPENAI_API_KEY`               | Azure OpenAI resource (`brfs-openai`) → Keys → regenerate                  |
| `CLARITY_API_TOKEN`                  | Clarity → Settings → Data Export → revoke + generate new                   |
| `CLARITY_CRON_SECRET`                | Generate a new random string; update it in the Logic App's HTTP action too |

---

## Testing APIs

### Local Testing

```bash
# Start server
npm start

# Test contact form (from another terminal)
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "message": "This is a test message"
  }'

# Test fire incidents
curl http://localhost:3000/api/fire-incidents

# Test fire danger
curl http://localhost:3000/api/fire-danger

# Test health check
curl http://localhost:3000/api/health

# Test mapbox token
curl http://localhost:3000/mapbox-token
```

### Integration Testing

See `__tests__/` directory for:

- Form validation tests
- Error handling tests
- API response parsing tests

---

## Monitoring and Logging

### Server Logs

The Express server logs:

- Server startup: `Server is running on port 3000`
- Configuration errors: `AZURE_*_WEBHOOK_URL not configured`
- Upstream errors: `Azure webhook returned status XXX`
- Spam attempts: `Potential spam submission detected`

### Frontend Logs

- API fetch errors logged to console
- User-visible errors shown in UI
- Validation errors displayed in forms

### Azure Application Insights

`infra/main.bicep` provisions an Application Insights resource
(`<staticWebAppName>-insights`, backed by a `<staticWebAppName>-logs` Log
Analytics workspace) alongside the Static Web App shell. It isn't wired up
automatically — like every other setting, connecting it is a one-time,
out-of-band step (see `infra/README.md`):

```bash
CONN=$(az deployment group show -g BungendoreRFS -n main \
  --query properties.outputs.appInsightsConnectionString.value -o tsv)
az staticwebapp appsettings set \
  --name bungendorerfs-static --resource-group BungendoreRFS \
  --setting-names "APPLICATIONINSIGHTS_CONNECTION_STRING=$CONN"
```

Once set, the SWA's managed Functions runtime auto-instruments with it — no
code changes needed in `api/`. Query it with `az monitor app-insights query`
(or, if that extension won't install, `az rest` against
`https://api.applicationinsights.io/v1/apps/<AppId>/query` using an
`az account get-access-token --resource https://api.applicationinsights.io`
token).

### Recommended Monitoring

For production:

1. Monitor Logic Apps execution history
2. Set up alerts for:
   - Failed API calls
   - High error rates
   - Unusual traffic patterns

---

## Troubleshooting

### Common Issues

**"Server configuration error"**

- Check `.env` file exists
- Verify all required variables are set
- Restart server after changing `.env`

**"Failed to fetch events/incidents"**

- Check Azure Logic Apps are running
- Verify webhook URLs are current
- Check Azure Logic Apps execution history

**Map not loading**

- Verify `MAPBOX_ACCESS_TOKEN` is set
- Check token hasn't been revoked
- Verify origin is whitelisted in Mapbox

**Form submission fails**

- Check validation rules
- Verify `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS` and `CONTACT_NOTIFY_TO` are set
- Confirm the `notify.bungendorerfs.org` domain is Verified in the ACS resource and
  linked to `stationkit-comm`
- Test honeypot isn't being filled

---

## Support

For issues or questions:

1. Check this documentation
2. Review server logs
3. Check Azure Logic Apps execution history
4. Open GitHub issue with details

---

Maintained alongside `api/*/index.js` and `server.js` — update this doc in the same
PR that changes an endpoint's contract.
