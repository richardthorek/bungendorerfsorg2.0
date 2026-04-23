# Quick Fixes Checklist

This document provides a fast-track checklist for addressing the most critical issues identified in the [Comprehensive Codebase Review](./CODEBASE_REVIEW.md).

---

## 🔴 Critical Security Fixes (DO IMMEDIATELY)

### 1. Remove Token Logging (5 minutes)

- [ ] **File:** `replace-token.js`
- [ ] **Action:** Delete line 8: `console.log(accessToken);`
- [ ] **Verify:** Run `npm start` and check that token is not printed

### 2. Regenerate Azure API Signatures (15 minutes)

- [ ] **Action:** Go to Azure Portal → Logic Apps
- [ ] **Regenerate signatures for:**
  - Contact form webhook
  - Calendar events webhook
  - Any other webhooks used in map.js
- [ ] **Save new URLs to `.env` file (DO NOT commit!)**

### 3. Move Azure URLs to Environment Variables (1 hour)

- [ ] **Create `.env` file in root:**

```bash
MAPBOX_ACCESS_TOKEN=your_token_here
AZURE_CONTACT_WEBHOOK_URL=your_new_contact_url
AZURE_CALENDAR_WEBHOOK_URL=your_new_calendar_url
AZURE_INCIDENTS_WEBHOOK_URL=your_new_incidents_url
```

- [ ] **Update `server.js`** - Add proxy endpoints:

```javascript
// Add after line 12
app.post("/api/contact", async (req, res) => {
  try {
    const response = await fetch(process.env.AZURE_CONTACT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to submit form" });
  }
});

app.get("/api/calendar-events", async (req, res) => {
  try {
    const response = await fetch(process.env.AZURE_CALENDAR_WEBHOOK_URL);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});
```

- [ ] **Update `public/js/contact.js` line 35:**

```javascript
// Old:
fetch("https://prod-03.australiaeast.logic.azure.com:443/workflows/...", {

// New:
fetch("/api/contact", {
```

- [ ] **Update `public/js/calendar.js` line 9:**

```javascript
// Old:
fetch("https://prod-12.australiaeast.logic.azure.com:443/workflows/...", {

// New:
fetch("/api/calendar-events", {
```

- [ ] **Test:** Submit contact form and verify it still works

### 4. Sanitize All innerHTML Assignments (30 minutes)

- [ ] **Files:** `public/js/main.js`, `public/js/map.js`, `public/js/dynamicContent.js`
- [ ] **Action:** Wrap all `innerHTML = ...` with `DOMPurify.sanitize()`

**main.js line 65:**

```javascript
// Old:
fireInfoTableContainer.innerHTML = tableHTML;

// New:
fireInfoTableContainer.innerHTML = DOMPurify.sanitize(tableHTML);
```

**main.js line 132:**

```javascript
// Old:
BFDPContent.innerHTML = tableHTML;

// New:
BFDPContent.innerHTML = DOMPurify.sanitize(tableHTML);
```

**main.js line 188:**

```javascript
// Old and New - no change needed:
fireDangerTableContainer.innerHTML = "";
// Note: Empty strings don't need sanitization
```

**map.js line 247:**

```javascript
// Old:
incidentCountCell.innerHTML = tableHTML;

// New:
incidentCountCell.innerHTML = DOMPurify.sanitize(tableHTML);
```

**dynamicContent.js line 16:**

```javascript
// Old:
document.getElementById(contentId).innerHTML = marked.parse(markdown);

// New:
document.getElementById(contentId).innerHTML = DOMPurify.sanitize(marked.parse(markdown));
```

- [ ] **Test:** Verify all content still displays correctly

### 5. Add Origin Validation to Token Endpoint (15 minutes)

- [ ] **File:** `server.js`
- [ ] **Add after line 9:**

```javascript
// Endpoint to get the Mapbox token
app.get("/mapbox-token", (req, res) => {
  const allowedOrigins = ["https://www.bungendorerfs.org", "http://localhost:3000"];
  const origin = req.headers.origin;

  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ token: process.env.MAPBOX_ACCESS_TOKEN });
});
```

- [ ] **Test:** Access from localhost should work, other origins should fail

---

## 🟠 High-Priority Fixes (DO THIS WEEK)

### 6. Update Dependencies (15 minutes)

```bash
# Remove incorrect 'node' dependency
npm uninstall node

# Update outdated packages
npm install dotenv@latest leaflet@latest

# Check for vulnerabilities
npm audit
npm audit fix

# Commit package.json and package-lock.json
```

- [ ] **Remove:** `node` from dependencies
- [ ] **Update:** `dotenv` to 16.x
- [ ] **Update:** `leaflet` to 1.9.4
- [ ] **Run:** `npm audit` and fix any vulnerabilities

### 7. Add Form Validation (1 hour)

- [ ] **File:** `public/js/contact.js`
- [ ] **Add before line 24:**

```javascript
function validateForm(data) {
  const errors = [];

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    errors.push("Please enter a valid email address");
  }

  // Phone validation (Australian format - optional field)
  if (data.phone) {
    const phoneRegex = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
    const cleanPhone = data.phone.replace(/\s/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      errors.push("Please enter a valid Australian phone number");
    }
  }

  // Name validation
  if (!data.name || data.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters");
  }

  // Message validation
  if (!data.message || data.message.trim().length < 10) {
    errors.push("Message must be at least 10 characters");
  }

  return errors;
}
```

- [ ] **Update form.addEventListener (line 24):**

```javascript
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  // Validate form
  const errors = validateForm(data);
  if (errors.length > 0) {
    showModal("Please correct the following:", errors.join("<br>"));
    return;
  }

  // Continue with existing submission code...
  const originalButtonText = submitButton.innerHTML;
  submitButton.innerHTML = '<span aria-busy="true"></span>';

  // ... rest of existing code
});
```

- [ ] **Test:** Try submitting with invalid data

### 8. Add Error Messages for API Failures (1 hour)

- [ ] **File:** Create `public/js/error-handler.js`

```javascript
// Error handling utility
function showErrorMessage(containerId, message, retryCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const errorHTML = `
    <div class="error-banner" role="alert" style="padding: 1rem; background: var(--del-color); border-radius: 0.5rem; margin: 1rem 0;">
      <i class="fas fa-exclamation-triangle"></i>
      <p style="margin: 0.5rem 0;">${message}</p>
      ${retryCallback ? '<button onclick="' + retryCallback + '()">Retry</button>' : ""}
    </div>
  `;

  container.innerHTML = DOMPurify.sanitize(errorHTML);
}
```

- [ ] **Add to `public/index.html` before other scripts:**

```html
<script src="js/error-handler.js"></script>
```

- [ ] **Update fetch calls in map.js, calendar.js to use showErrorMessage**

### 9. Extract Duplicate showModal() (30 minutes)

- [ ] **File:** Create `public/js/modal-utils.js`

```javascript
// Shared modal utilities
function showModal(title, content) {
  const modal = document.getElementById("contactModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalContent = document.getElementById("modalContent");

  if (!modal || !modalTitle || !modalContent) {
    console.error("Modal elements not found");
    return;
  }

  modalTitle.textContent = title;
  modalContent.innerHTML = DOMPurify.sanitize(content);
  modal.showModal();
}

function closeModal() {
  const modal = document.getElementById("contactModal");
  if (modal) {
    modal.close();
  }
}
```

- [ ] **Add to `public/index.html` before contact.js and calendar.js**
- [ ] **Remove showModal() from `contact.js` (lines 88-123)**
- [ ] **Remove showModal() from `calendar.js` (lines 80-115)**
- [ ] **Test:** Verify modals still work

---

## ✅ Verification Checklist

After completing all fixes, verify:

- [ ] Server starts without errors: `npm start`
- [ ] No tokens logged to console
- [ ] Contact form submits successfully
- [ ] Contact form validation works (try invalid email/phone)
- [ ] Calendar events load
- [ ] Map loads with incidents
- [ ] Error messages display when APIs are unreachable
- [ ] No console errors in browser DevTools
- [ ] `npm audit` shows no critical vulnerabilities

---

## 📝 Create .env.example

Create a template for other developers:

```bash
# .env.example
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
AZURE_CONTACT_WEBHOOK_URL=https://prod-xx.australiaeast.logic.azure.com/...
AZURE_CALENDAR_WEBHOOK_URL=https://prod-xx.australiaeast.logic.azure.com/...
AZURE_INCIDENTS_WEBHOOK_URL=https://prod-xx.australiaeast.logic.azure.com/...
PORT=3000
```

- [ ] Create `.env.example` file
- [ ] Ensure `.env` is in `.gitignore` (already there)
- [ ] Update README with setup instructions

---

## 🚀 Deployment Notes

Before deploying to production:

1. **Environment Variables:** Ensure all production URLs are in the hosting environment variables
2. **HTTPS:** All endpoints must use HTTPS in production
3. **CORS:** Configure CORS headers in server.js for production domain
4. **Rate Limiting:** Consider adding express-rate-limit package
5. **Monitoring:** Set up error logging (e.g., Sentry, LogRocket)

---

## 📚 Additional Resources

- [Full Codebase Review](./CODEBASE_REVIEW.md) - Complete analysis with detailed explanations
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - Web security risks
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)

---

**Total Estimated Time for Critical Fixes:** 2-3 hours  
**Total Estimated Time for All Quick Fixes:** 5-6 hours

**Need Help?** Refer to the [full codebase review](./CODEBASE_REVIEW.md) for detailed explanations and alternative approaches.
