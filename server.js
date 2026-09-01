require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const { handleContactSubmission } = require("./api/contact/submit");
const { getClientIp } = require("./api/shared/auth");
const { validateContactFormData } = require("./api/shared/contactValidation");
const { getFireDanger, getFireIncidents } = require("./api/shared/fireDataProxy");
const {
  getFireWeatherWarning,
  getWindObservations,
  getTrafficHazards,
} = require("./api/shared/externalFeeds");
const { checkHealth } = require("./api/shared/health");
const {
  handleAuthRequest,
  handleAuthVerify,
  handleAuthMe,
  handleAuthLogout,
  handleMembersList,
  handleMembersUpsert,
  handleMembersDelete,
  handleDutyLookup,
  handleDutyStatus,
  handleDutySet,
  handleDutyClaim,
  handleContentGet,
  handleContentSet,
  handleEnquiriesList,
  handleEnquiryUpdate,
  handleEnquiryDelete,
  handleSocialChat,
  handleSocialPromptGet,
  handleSocialPromptSet,
  handleClarityInsights,
  handleClarityCron,
} = require("./api/shared/handlers");

const allowedOrigins = [
  "https://bungendorerfs.org",
  "https://www.bungendorerfs.org",
  "http://localhost:3000",
  "https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net",
];

// Middleware to parse JSON bodies. 5mb ceiling matches the shared handlers'
// contract: /api/social/chat accepts image data URLs up to ~3mb (plus the
// transcript envelope). Every endpoint still length-checks its own inputs.
app.use(express.json({ limit: "5mb" }));

// Basic CORS handling for API requests when routed via redirects
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Request-ID");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Endpoint to get the Mapbox token with origin validation
app.get("/mapbox-token", (req, res) => {
  let origin = req.headers.origin;

  // If no origin header, try to extract from referer
  if (!origin && req.headers.referer) {
    try {
      origin = new URL(req.headers.referer).origin;
    } catch (e) {
      // Invalid referer URL, ignore
    }
  }

  // Allow requests without origin (same-origin requests)
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ token: process.env.MAPBOX_ACCESS_TOKEN });
});

// Contact form submission — emails the committee distribution list via ACS
app.post("/api/contact", async (req, res) => {
  try {
    const body = req.body || {};

    // Honeypot spam check - if website field is filled, reject silently
    if (body.website) {
      console.warn("Potential spam submission detected (honeypot filled)");
      // Return success to not alert spammers
      return res.json({ success: true, message: "Thank you for your submission" });
    }

    // Validate form data
    const validationErrors = validateContactFormData(body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationErrors,
      });
    }

    const sanitizedData = {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone ? body.phone.trim() : "",
      message: body.message.trim(),
    };

    const result = await handleContactSubmission(sanitizedData, {
      ip: getClientIp(req),
    });

    if (result.rateLimited) {
      return res
        .status(429)
        .set("Retry-After", String(result.retryAfter || 60))
        .json({ error: "Too many submissions. Please try again later." });
    }

    res.json({ success: true, message: "Thank you for your enquiry" });
  } catch (error) {
    console.error("Error handling contact form:", error);
    res.status(500).json({ error: "Failed to submit form" });
  }
});

// Proxy endpoint for fire incidents (map data) — see api/shared/fireDataProxy.js
// for the shared caching/stale-while-revalidate logic behind getFireIncidents.
app.get("/api/fire-incidents", async (req, res) => {
  const result = await getFireIncidents(process.env, { logger: console });
  if (!result.ok) {
    return res.status(result.status || 500).json({ error: result.error || "Failed to fetch incidents" });
  }
  res.set("X-Data-Freshness", result.stale ? "stale" : "fresh");
  res.set("X-Data-Age-Seconds", String(result.ageSeconds));
  res.json(result.body);
});

// Proxy endpoint for fire danger rating — see api/shared/fireDataProxy.js for
// the shared caching/stale-while-revalidate logic behind getFireDanger.
app.get("/api/fire-danger", async (req, res) => {
  const result = await getFireDanger(process.env, { logger: console });
  if (!result.ok) {
    return res.status(result.status || 500).json({ error: result.error || "Failed to fetch fire danger" });
  }
  res.set("Content-Type", result.contentType || "application/xml");
  res.set("X-Data-Freshness", result.stale ? "stale" : "fresh");
  res.set("X-Data-Age-Seconds", String(result.ageSeconds));
  res.send(result.body);
});

// New external feeds (WEBSITE_ROADMAP Workstream 7) — see
// api/shared/externalFeeds.js for the shared fetch/cache/honest-failure logic
// behind each of these, reusing fireDataProxy's cache-tier contract.
app.get("/api/fire-weather-warning", async (req, res) => {
  const result = await getFireWeatherWarning(process.env, { logger: console });
  if (!result.ok) {
    return res.status(result.status || 500).json({ error: result.error || "Failed to fetch fire weather warning" });
  }
  res.set("X-Data-Freshness", result.stale ? "stale" : "fresh");
  res.set("X-Data-Age-Seconds", String(result.ageSeconds));
  res.json(result.body);
});

app.get("/api/wind-observations", async (req, res) => {
  const result = await getWindObservations(process.env, { logger: console });
  if (!result.ok) {
    return res.status(result.status || 500).json({ error: result.error || "Failed to fetch wind observations" });
  }
  res.set("X-Data-Freshness", result.stale ? "stale" : "fresh");
  res.set("X-Data-Age-Seconds", String(result.ageSeconds));
  res.json(result.body);
});

app.get("/api/traffic-hazards", async (req, res) => {
  const hazardType = req.query.type || "fire";
  const result = await getTrafficHazards(process.env, { logger: console, hazardType });
  if (!result.ok) {
    return res.status(result.status || 500).json({ error: result.error || "Failed to fetch traffic hazards" });
  }
  res.set("X-Data-Freshness", result.stale ? "stale" : "fresh");
  res.set("X-Data-Age-Seconds", String(result.ageSeconds));
  res.json(result.body);
});

// Lightweight health check for external uptime monitoring — see
// api/shared/health.js. Public, no sensitive data.
app.get("/api/health", async (req, res) => {
  const result = await checkHealth(process.env);
  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// Members' area — mirrors api/auth-* and api/members (see api/shared/handlers.js)
// ---------------------------------------------------------------------------
function sendResult(res, result) {
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) res.set(k, v);
  }
  if (result.setCookie) res.append("Set-Cookie", result.setCookie);
  if (result.clearCookie) {
    const { clearCookie } = require("./api/shared/auth");
    res.append("Set-Cookie", clearCookie());
  }
  res.status(result.status || 200).json(result.body);
}

function mirror(handler) {
  return async (req, res) => {
    try {
      sendResult(res, await handler(req, process.env));
    } catch (err) {
      console.error("members-area handler failed:", err);
      res.status(500).json({ error: "Something went wrong. Try again." });
    }
  };
}

app.post("/api/auth/request", mirror(handleAuthRequest));
app.post("/api/auth/verify", mirror(handleAuthVerify));
app.get("/api/auth/me", mirror(handleAuthMe));
app.post("/api/auth/logout", mirror(handleAuthLogout));

app.get("/api/members", mirror(handleMembersList));
app.post("/api/members", mirror(handleMembersUpsert));
app.delete(
  "/api/members/:email",
  mirror((req) => handleMembersDelete(req, req.params.email, process.env))
);

app.get("/api/duty/status", mirror(handleDutyStatus));
app.get("/api/duty", mirror(handleDutyLookup));
app.post("/api/duty/claim", mirror(handleDutyClaim));
app.post("/api/duty", mirror(handleDutySet));

app.get(
  "/api/content/:key",
  mirror((req) => handleContentGet(req.params.key, process.env))
);
app.put(
  "/api/content/:key",
  mirror((req) => handleContentSet(req.params.key, req, process.env))
);

app.get("/api/enquiries", mirror(handleEnquiriesList));
app.patch(
  "/api/enquiries/:id",
  mirror((req) => handleEnquiryUpdate(req.params.id, req, process.env))
);
app.delete(
  "/api/enquiries/:id",
  mirror((req) => handleEnquiryDelete(req.params.id, req, process.env))
);

app.post("/api/social/chat", mirror(handleSocialChat));
app.get("/api/social/prompt", mirror(handleSocialPromptGet));
app.put("/api/social/prompt", mirror(handleSocialPromptSet));

app.get("/api/clarity/insights", mirror(handleClarityInsights));
app.post("/api/clarity/cron", mirror(handleClarityCron));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
