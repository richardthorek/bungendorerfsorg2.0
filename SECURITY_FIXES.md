# Security Fixes Documentation

This document details the security fixes and improvements implemented to address critical vulnerabilities identified in the codebase review.

## Date: February 2026

---

## Members' area review — August 2026

Full security/performance/UX review of the members' area, brigade-phone,
enquiries and contact→ACS work (PRs #90–#101). No backdoors found. Fixes applied:

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | High | `/api/contact` had no rate limiting — an open relay for the confirmation email (bomb any address) and a way to flood the leadership DL / `enquiries` table | `handleContactSubmission` now throttles per-IP (6/hr) and per-submitted-email (4/hr) via the existing `hitRateLimit`; both backends pass the client IP and return `429` + `Retry-After`. Fails open on limiter error. |
| 2 | Low | `getClientIp` trusted the **first** `X-Forwarded-For` entry, which is client-supplied → IP rate-limits were spoofable | Takes the **last** entry (appended by Azure Front Door / SWA); IPv6-safe port strip |
| 3 | Low | `handleAuthLogout` skipped the `X-BRFS-Auth` CSRF-header check every other mutating handler enforces | Added the check (`403` without it); the admin client already sends it |
| 4 | Low | `handleDutyStatus` returned the setter's full email to every member | `setBy` now admin-only; members still get `setByName` |
| 5 | Low | `dutyKeyOk` and the SMS-claim PIN compared secrets with `===` | Constant-time `crypto.timingSafeEqual` via a length-safe `safeEqual` helper |
| 6 | Nit | `ratelimits` rows accumulated forever (Table Storage has no TTL) | `purgeExpiredRateLimits` sweeps rows >24h old, run opportunistically (~2% of `hitRateLimit` calls), capped at 200/pass |

---

## Critical Security Fixes Implemented (February 2026)

> **Superseded in places.** This section is the original remediation record. Since
> it was written: the contact form moved off its Logic App to Azure Communication
> Services (`AZURE_CONTACT_WEBHOOK_URL` gone), the calendar Logic App and
> `AZURE_CALENDAR_WEBHOOK_URL` were removed entirely, and the members' area added
> ACS sign-in, `brfsstorage`, Azure OpenAI and Microsoft Clarity. The **principles**
> below still hold; the specific webhook/variable names in "Required Next Steps"
> are historical. Current env surface: `api/local.settings.example.json`.

### 1. ✅ Removed Token Logging (CRITICAL)

**File:** `replace-token.js`
**Issue:** Mapbox access token was being logged to console on server startup, exposing it in logs.
**Fix:** Removed `console.log(accessToken)` statement on line 8.
**Impact:** Prevents token exposure in server logs, CI/CD logs, and log aggregation services.

### 2. ✅ Added XSS Protection with DOMPurify (CRITICAL)

**Files:** `public/js/main.js`, `public/js/map.js`, `public/js/dynamicContent.js`
**Issue:** Multiple locations used `.innerHTML` with unsanitized content from API responses.
**Fix:** Wrapped all `.innerHTML` assignments with `DOMPurify.sanitize()`:

- `main.js` line 65: `fireInfoTableContainer.innerHTML = DOMPurify.sanitize(tableHTML);`
- `main.js` line 132: `BFDPContent.innerHTML = DOMPurify.sanitize(tableHTML);`
- `map.js` line 247: `incidentCountCell.innerHTML = DOMPurify.sanitize(tableHTML);`
- `dynamicContent.js` line 16: `document.getElementById(contentId).innerHTML = DOMPurify.sanitize(marked.parse(markdown));`
  **Impact:** Prevents XSS attacks if API is compromised or returns malicious content.

### 3. ✅ Moved Azure Logic App URLs to Backend Proxy (CRITICAL)

**Files:** `server.js`, `public/js/contact.js`, `public/js/calendar.js`, `public/js/map.js`, `public/js/main.js`
**Issue:** Azure Logic Apps webhook URLs with API signatures were hardcoded in client-side JavaScript.
**Fix:**

- Created backend proxy endpoints in `server.js`:
  - `/api/contact` - Contact form submission proxy
  - `/api/calendar-events` - Calendar events proxy
  - `/api/fire-incidents` - Fire incidents map data proxy
  - `/api/fire-danger` - Fire danger rating proxy
  - `/api/mapbox-token` - Mapbox token proxy (POST)
- Updated all frontend JavaScript files to use proxy endpoints instead of direct Azure URLs
- Created `.env.example` template for environment variables

**IMPORTANT:** The old Azure Logic App URLs with signatures have been removed from the codebase. You MUST:

1. Regenerate all Azure Logic App signatures via Azure Portal
2. Add the new URLs to a `.env` file (DO NOT commit this file)
3. Configure environment variables in your hosting environment

**Impact:** Eliminates exposure of backend endpoints and API signatures to clients.

### 4. ✅ Added Origin Validation to Token Endpoint (HIGH)

**File:** `server.js`
**Issue:** `/mapbox-token` endpoint was accessible to any client without validation.
**Fix:** Added origin validation to whitelist allowed domains:

```javascript
const allowedOrigins = [
  "https://www.bungendorerfs.org",
  "http://localhost:3000",
  "https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net",
];
```

**Impact:** Prevents unauthorized use of the Mapbox token from other domains.

---

## Code Quality Improvements

### 5. ✅ Updated Dependencies

**File:** `package.json`
**Changes:**

- Removed incorrect `node` package dependency
- Updated `dotenv` from `^10.0.0` to `^16.4.0`
- Updated `leaflet` from `^1.7.1` to `^1.9.4`
  **Vulnerabilities:** 0 vulnerabilities found after running `npm audit`
  **Impact:** Keeps dependencies current and secure, removes confusion from incorrect node package.

### 6. ✅ Extracted Duplicate showModal() Function

**Files:** `public/js/modal-utils.js` (new), `public/js/contact.js`, `public/js/calendar.js`, `public/index.html`
**Issue:** `showModal()` function was duplicated in both contact.js and calendar.js (36 lines each).
**Fix:**

- Created shared `modal-utils.js` with the showModal function
- Removed duplicate implementations from contact.js and calendar.js
- Added modal-utils.js to index.html script loading order (before contact.js and calendar.js)
  **Impact:** Reduces code duplication, improves maintainability, smaller bundle size.

---

## Required Next Steps (February 2026 — historical)

The February 2026 deployment required regenerating the Logic App SAS URLs (contact,
calendar, incidents, fire danger, mapbox), creating `.env` from `.env.example`,
and setting the same variables on the Static Web App. Contact and calendar have
since been removed. For the **current** credential list and rotation steps see
[`docs/API_INTEGRATION.md` → Credential Rotation](docs/API_INTEGRATION.md#credential-rotation)
and [`api/local.settings.example.json`](api/local.settings.example.json).

---

## Security Status

### Before Fixes:

- 🔴 3 Critical Security Issues
- 🟠 1 High Priority Issue
- ⚠️ Multiple exposed credentials and API endpoints

### After Fixes:

- ✅ All critical security issues resolved
- ✅ All exposed credentials moved to backend
- ✅ XSS protection implemented
- ✅ Origin validation added
- ✅ Dependencies updated
- ✅ Code quality improved

---

## References

- [docs/API_INTEGRATION.md](./docs/API_INTEGRATION.md) - current endpoint + credential reference
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## Contact

For questions about these security fixes, please refer to the original issue or the documentation referenced above.
