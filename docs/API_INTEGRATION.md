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

Mail plumbing lives in `api/contact/notify.js`, which `server.js` also imports so
both backends send identical messages. There is no longer any SharePoint, Teams,
or Logic App in this path — the `formHandler` Logic App and its Office 365 /
SharePoint connections are retired.

---

### 2. Community events & training schedule (static content, not a live endpoint)

**Not proxied through the API.** Community events and the recurring training
schedule are read directly by `public/js/calendar.js` from static content files:

- `GET /Content/communityEvents.json` — array of `{ name, timing, description }`.
- `GET /Content/trainingSchedule.json` — array of `{ title, recurrence, time, location }`;
  `calendar.js` computes each item's next occurrence client-side from `recurrence`
  (e.g. `second-saturday`, `every-friday`) using Luxon, converted to
  `Australia/Sydney`.

See the README's [Editing site content](../README.md#editing-site-content-no-code-required)
section for the schema and edit workflow.

`GET /api/calendar-events` (backed by `AZURE_CALENDAR_WEBHOOK_URL`) still exists in
`api/` and `server.js` for backward compatibility, but nothing in the current
frontend calls it — the site no longer depends on a live Microsoft Graph calendar
feed for events or training.

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
shell — sign-in, then sections for Duty line, Events & training (both built later)
and Members (admin only). Backend logic is shared: `api/shared/handlers.js` is used
by `api/auth-*` / `api/members` and mirrored in `server.js`.

**Sign-in** is passwordless. A person may sign in only if BOTH:

1. their email is on `AUTH_ALLOWED_EMAIL_DOMAIN` (`rfs.nsw.gov.au`), and
2. their email is a row in the `members` table (the allow-list) and not disabled.

| Endpoint                                       | Notes                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/request` `{email}`             | Emails a 6-digit code via ACS (10-min, single-use, 5-attempt lock). Always returns `{ok:true}` — never reveals whether the address is a member. Rate-limited per email (3/15 min) and per IP. |
| `POST /api/auth/verify` `{email,code}`         | On success sets `brfs_session` — an HS256 JWT, `HttpOnly; Secure; SameSite=Lax`, **60-min** expiry (`AUTH_SESSION_MINUTES`).                                                                  |
| `GET /api/auth/me`                             | `{email,name,role,expiresAt}` or 401. Re-checks the `members` row every call, so disabling a member or bumping `tokenVersion` logs them out at once.                                          |
| `POST /api/auth/logout`                        | Clears the cookie and bumps `tokenVersion` so the token can't be replayed.                                                                                                                    |
| `GET /api/members`                             | Admin only. `{members:[…]}`                                                                                                                                                                   |
| `POST /api/members` `{email,displayName,role}` | Admin only. Adds/updates an allow-list entry (must be an `@rfs.nsw.gov.au` address). Requires header `X-BRFS-Auth: 1`.                                                                        |
| `DELETE /api/members/{email}`                  | Admin only. Ends the member's session and removes them. Refuses to remove the last admin. Requires `X-BRFS-Auth: 1`.                                                                          |

**Storage:** four Azure Storage tables in `brfsstorage` (`BRFS_STORAGE_CONNECTION`),
created on first use — `members`, `authcodes`, `ratelimits`, `auditlog`.

**First admin:** there's no self-serve bootstrap. Seed it once:

```bash
BRFS_STORAGE_CONNECTION="<brfsstorage connection string>" \
  node scripts/seed-member.js richardthorek-vol@rfs.nsw.gov.au "Richard Thorek" admin
```

**Config:** `AUTH_JWT_SECRET` (≥32 chars), `BRFS_STORAGE_CONNECTION`,
`AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`, plus the existing
`ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS`.

---

## Azure Logic Apps Integration

Azure Logic Apps provides the serverless backend for:

1. Fire incident data aggregation
2. Fire danger rating XML feed

(The contact form no longer uses Logic Apps — it sends email directly via Azure
Communication Services. See [Contact Form Submission](#1-contact-form-submission).)

(A calendar-events workflow still exists for backward compatibility — see
[Community events & training schedule](#2-community-events--training-schedule-static-content-not-a-live-endpoint)
above — but the site doesn't call it.)

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
- `AZURE_CALENDAR_WEBHOOK_URL` — optional; kept for backward compatibility, unused by the current frontend

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
AZURE_CALENDAR_WEBHOOK_URL=https://prod-...
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
