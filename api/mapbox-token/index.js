/**
 * Azure Function: Mapbox Token
 * Returns the Mapbox access token with origin validation
 */

const allowedOrigins = [
  "https://bungendorerfs.org",
  "https://www.bungendorerfs.org",
  "http://localhost:3000",
  "https://lively-flower-0577f4700.eastasia.5.azurestaticapps.net",
  "https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net",
];

module.exports = async function (context, req) {
  const origin = req.headers.origin || req.headers.referer;

  // Extract origin from referer if needed
  let validatedOrigin = origin;
  if (!validatedOrigin && req.headers.referer) {
    try {
      validatedOrigin = new URL(req.headers.referer).origin;
    } catch (e) {
      // Invalid referer URL, ignore
    }
  }

  // Allow requests without origin (same-origin requests) or validate origin
  if (validatedOrigin && !allowedOrigins.includes(validatedOrigin)) {
    context.res = {
      status: 403,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: "Forbidden" },
    };
    return;
  }

  // Get token from environment variable
  const token = process.env.MAPBOX_ACCESS_TOKEN;

  if (!token) {
    context.log.error("MAPBOX_ACCESS_TOKEN not configured");
    context.res = {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: "Server configuration error" },
    };
    return;
  }

  // Set CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (validatedOrigin && allowedOrigins.includes(validatedOrigin)) {
    headers["Access-Control-Allow-Origin"] = validatedOrigin;
    headers["Vary"] = "Origin";
  }

  context.res = {
    status: 200,
    headers: headers,
    body: { token: token },
  };
};
