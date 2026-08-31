require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const { sendContactNotifications } = require("./api/contact/notify");
const {
  handleAuthRequest,
  handleAuthVerify,
  handleAuthMe,
  handleAuthLogout,
  handleMembersList,
  handleMembersUpsert,
  handleMembersDelete,
} = require("./api/shared/handlers");

const allowedOrigins = [
  "https://bungendorerfs.org",
  "https://www.bungendorerfs.org",
  "http://localhost:3000",
  "https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net",
];

// Middleware to parse JSON bodies
app.use(express.json());

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

// Validation helper function
function validateContactFormData(data) {
  const errors = [];

  // Name validation
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters long");
  }
  if (data.name && data.name.trim().length > 100) {
    errors.push("Name must be less than 100 characters");
  }

  // Email validation
  // Prevent ReDoS by checking length first and using a simpler pattern
  if (!data.email || typeof data.email !== "string") {
    errors.push("Please provide a valid email address");
  } else if (data.email.length > 254) {
    // RFC 5321: Maximum email length is 254 characters
    errors.push("Email address is too long");
  } else {
    // Simple email validation - allows basic email format without ReDoS risk
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(data.email)) {
      errors.push("Please provide a valid email address");
    }
  }

  // Phone validation (optional field)
  if (data.phone && data.phone.trim()) {
    const phonePattern = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
    const cleanPhone = data.phone.replace(/[\s()-]/g, "");
    if (!phonePattern.test(cleanPhone)) {
      errors.push("Please provide a valid Australian phone number");
    }
  }

  // Message validation
  if (!data.message || typeof data.message !== "string" || data.message.trim().length < 10) {
    errors.push("Message must be at least 10 characters long");
  }
  if (data.message && data.message.trim().length > 2000) {
    errors.push("Message must be less than 2000 characters");
  }

  return errors;
}

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

    await sendContactNotifications(sanitizedData);

    res.json({ success: true, message: "Thank you for your enquiry" });
  } catch (error) {
    console.error("Error handling contact form:", error);
    res.status(500).json({ error: "Failed to submit form" });
  }
});

// Proxy endpoint for calendar events
app.get("/api/calendar-events", async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_CALENDAR_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error("AZURE_CALENDAR_WEBHOOK_URL not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const response = await fetch(webhookUrl);

    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: "Failed to fetch events" });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Proxy endpoint for fire incidents (map data)
app.get("/api/fire-incidents", async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_INCIDENTS_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error("AZURE_INCIDENTS_WEBHOOK_URL not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const response = await fetch(webhookUrl, {
      method: "GET",
      headers: {
        "X-Request-ID": "Get-Fire-Incidents",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: "Failed to fetch incidents" });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching fire incidents:", error);
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

// Proxy endpoint for fire danger rating
app.get("/api/fire-danger", async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error("AZURE_FIRE_DANGER_WEBHOOK_URL not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const response = await fetch(webhookUrl);

    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: "Failed to fetch fire danger" });
    }

    const data = await response.text();
    res.set("Content-Type", "application/xml");
    res.send(data);
  } catch (error) {
    console.error("Error fetching fire danger:", error);
    res.status(500).json({ error: "Failed to fetch fire danger" });
  }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
