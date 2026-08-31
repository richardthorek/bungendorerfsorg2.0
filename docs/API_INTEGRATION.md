# API Integration Documentation

This document describes all API integrations used in the Bungendore RFS website.

---

## Table of Contents

- [Overview](#overview)
- [Server-Side Proxy Endpoints](#server-side-proxy-endpoints)
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
Frontend (Browser)
  ↓
Static Web Apps Integrated API (HTTP-trigger Azure Functions)
  ↓
Azure Logic Apps / External APIs
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
which also seed the tables (`node scripts/seed-content.js`). See
[Members' area §7 — Brigade phone / §editable content](#7-brigade-phone-call--sms-forwarding-number).

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

---

### 5. Mapbox Token

**Endpoint:** `GET /mapbox-token`

**Purpose:** Provide Mapbox access token with origin validation

**Origin Validation:**
Allowed origins:

- `https://www.bungendorerfs.org`
- `http://localhost:3000`
- `https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net`

**Response:**

```json
{
  "token": "pk.ey..."
}
```

**Usage:**

- Map tiles for day/night mode
- Map rendering via Leaflet.js

---

### 6. Members' area (sign-in + allow-list)

**Page:** `/admin` (served from `public/admin.html`; `noindex`). Plain-JS dashboard
shell — sign-in, then **Brigade phone** (§7), **Enquiries** (§1), **Events &
training** (§2) and **Members** (admin only). Backend logic is shared:
`api/shared/handlers.js` is used by `api/{auth-*,members,duty,content,enquiries}`
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

**Storage:** Azure Storage tables in `brfsstorage` (`BRFS_STORAGE_CONNECTION`),
created on first use — `members`, `authcodes`, `ratelimits`, `auditlog`, `duty`,
`content`, `enquiries`.

**Seeding old enquiries:** `node scripts/seed-enquiries.js <file.json>` — an array
of `{name, message, email?, phone?, receivedAt?, legacyRef?}`, de-duplicated by
`legacyRef`. Starter file at `scripts/data/enquiries-seed.example.json`.

**First admin:** there's no self-serve bootstrap. Seed it once:

```bash
BRFS_STORAGE_CONNECTION="<brfsstorage connection string>" \
  node scripts/seed-member.js richardthorek-vol@rfs.nsw.gov.au "Richard Thorek" admin
```

**Config:** `AUTH_JWT_SECRET` (≥32 chars), `BRFS_STORAGE_CONNECTION`,
`AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`, plus the existing
`ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS`.

---

### 7. Brigade phone (call / SMS forwarding number)

Replaces the SharePoint lookup the Twilio Studio flow used to find the forwarding
number. Same `{ "Main": "+61…" }` contract, so the Twilio "Make HTTP Request"
widgets only need their URL changed. ("Brigade phone" in the UI — "duty" reads as
the district duty officer; routes and the `duty` table keep the old name.)

| Endpoint                              | Notes                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/duty`                       | Public — the Twilio flow calls this. Returns `{ "Main": "+61…" }`. If `DUTY_LOOKUP_KEY` is set, the caller must send `X-Duty-Key`. Missing record → 503 so Twilio falls through to its own backup number.                                                                                                                               |
| `GET /api/duty/status`                | Members only. `{ number, label, masked, setBy, setByName, method, setAt, contacts[] }` — `contacts` is the deduped list of previously-used `{number, label}` (current excluded) for one-click re-set.                                                                                                                                   |
| `POST /api/duty` `{number, label?}`   | Members only, `X-BRFS-Auth: 1`. `label` is a free-text name ("Sandi Love"). Validates an AU number, stores it with the label, appends history + audit + change-alert email.                                                                                                                                                             |
| `POST /api/duty/claim` `{From, Body}` | Twilio SMS webhook. `BRIGADE <pin>` / `DUTY <pin>` → forward to the sender's number; `OFF <pin>` → revert to `DUTY_FALLBACK_NUMBER`. Anything else → `{handled:false}` so Twilio forwards the text normally. Needs `DUTY_CLAIM_PIN`; honours `X-Duty-Key`; rate-limited per sender. Attributed to a member if their `phone` is on file. |

**Storage:** table `duty` in `brfsstorage` (RK `current` + `h:<reverse-ts>` history).
Members may carry an optional `phone` for SMS attribution.

**Config:** `DUTY_LOOKUP_KEY`, `DUTY_CLAIM_PIN`, `DUTY_FALLBACK_NUMBER`,
`DUTY_ALERT_TO` (defaults to `CONTACT_NOTIFY_TO`).

**Cut-over (Twilio Studio GUI):**

1. `node scripts/seed-duty.js +61…` — set the current number.
2. Widgets `phoneNumbers` (calls) and `phoneNumbers2` (SMS): **REQUEST URL** →
   `https://www.bungendorerfs.org/api/duty`, **METHOD** → `GET`, add header
   `X-Duty-Key: <DUTY_LOOKUP_KEY>`.
3. SMS-PIN (optional): before `phoneNumbers2`, add a **Split Based On…**
   `{{trigger.message.Body}}` widget — if it matches `^(?i)(brigade|duty|off)\b`,
   route to a new **Make HTTP Request** (`POST` to `/api/duty/claim`, body
   `From={{trigger.message.From}}&Body={{trigger.message.Body}}`, header
   `X-Duty-Key`), then a **Send Message** with `{{widgets.<name>.parsed.reply}}`;
   otherwise fall through to the existing forward.
4. Retire `phoneNumberForwarding` and the `prod-00` SMS-lookup Logic App.

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

### Required Environment Variables

See `.env.example` for complete list:

- `ACS_CONNECTION_STRING` — Azure Communication Services connection string (contact form)
- `ACS_SENDER_ADDRESS` — verified MailFrom on `notify.bungendorerfs.org` (contact form)
- `CONTACT_NOTIFY_TO` — committee distribution list; comma-separated for several recipients
- `CONTACT_NOTIFY_CONFIRM` — optional; `false` disables the enquirer acknowledgement (default `true`)
- `AZURE_INCIDENTS_WEBHOOK_URL`
- `AZURE_FIRE_DANGER_WEBHOOK_URL`

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

### Mapbox Tiles API

**Source:** Mapbox
**Data:** Map tiles (day/night mode)
**Authentication:** Access token
**Usage:** Map rendering with Leaflet.js

---

## Environment Configuration

### Required Variables

Create a `.env` file based on `.env.example`:

```bash
# Mapbox Configuration
MAPBOX_ACCESS_TOKEN=pk.ey...

# Contact form → Azure Communication Services Email
ACS_CONNECTION_STRING=endpoint=https://stationkit-comm.australia.communication.azure.com/;accesskey=...
ACS_SENDER_ADDRESS=contact@notify.bungendorerfs.org
CONTACT_NOTIFY_TO=committee@example-distribution-list.org

# Azure Logic Apps Webhook URLs
AZURE_INCIDENTS_WEBHOOK_URL=https://prod-...
AZURE_FIRE_DANGER_WEBHOOK_URL=https://prod-...

# Server Configuration
PORT=3000
```

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

If credentials are compromised:

1. **Azure Logic Apps:**
   - Go to Azure Portal → Logic Apps
   - Open workflow → Settings → Access keys
   - Regenerate shared access signature
   - Update `.env` file with new URL

2. **Mapbox Token:**
   - Go to Mapbox Account → Tokens
   - Create new token with domain restrictions
   - Revoke old token
   - Update `.env` file

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

### Recommended Monitoring

For production:

1. Set up Azure Application Insights
2. Monitor Logic Apps execution history
3. Set up alerts for:
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
