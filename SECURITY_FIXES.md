# Security Fixes Documentation

This document details the security fixes and improvements implemented to address critical vulnerabilities identified in the codebase review.

## Date: February 2026

---

## Critical Security Fixes Implemented

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
  'https://www.bungendorerfs.org',
  'http://localhost:3000',
  'https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net'
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

## Required Next Steps

### IMMEDIATE ACTION REQUIRED ⚠️

Before deploying these changes to production, you MUST:

1. **Regenerate Azure Logic App Signatures:**
   - Go to Azure Portal → Logic Apps
   - Find each Logic App:
     - Contact form webhook
     - Calendar events webhook
     - Fire incidents webhook
     - Fire danger rating webhook
     - Mapbox token webhook
   - Regenerate the signatures for each
   - Copy the new complete URLs

2. **Create .env File:**
   - Copy `.env.example` to `.env`
   - Replace placeholder URLs with your newly generated Azure Logic App URLs
   - Add your Mapbox access token
   - DO NOT commit the `.env` file (it's in .gitignore)

3. **Configure Production Environment:**
   - Add all environment variables to your hosting platform
   - Ensure the following are set:
     - `MAPBOX_ACCESS_TOKEN`
     - `AZURE_CONTACT_WEBHOOK_URL`
     - `AZURE_CALENDAR_WEBHOOK_URL`
     - `AZURE_INCIDENTS_WEBHOOK_URL`
     - `AZURE_FIRE_DANGER_WEBHOOK_URL`
     - `AZURE_MAPBOX_TOKEN_WEBHOOK_URL` (optional, falls back to MAPBOX_ACCESS_TOKEN)
     - `PORT` (optional, defaults to 3000)

4. **Test All Functionality:**
   - Contact form submission
   - Calendar events display
   - Map with fire incidents
   - Fire danger rating display
   - Modal functionality

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

- [CODEBASE_REVIEW.md](./Documentation/CODEBASE_REVIEW.md) - Full codebase review
- [QUICK_FIXES.md](./Documentation/QUICK_FIXES.md) - Quick fixes checklist
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## Contact

For questions about these security fixes, please refer to the original issue or the documentation referenced above.
