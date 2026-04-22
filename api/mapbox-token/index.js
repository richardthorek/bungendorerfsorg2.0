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

const allowedOriginPatterns = [
  /^https:\/\/lively-flower-0577f4700-[0-9]+\.eastasia\.5\.azurestaticapps\.net$/,
  /^https:\/\/[a-z0-9-]+\.githubpreview\.dev$/,
  /^https:\/\/[a-z0-9-]+\.app\.github\.dev$/,
];

module.exports = async function (context, req) {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  // Always normalize to an origin value before validation.
  let validatedOrigin = originHeader;
  if (!validatedOrigin && refererHeader) {
    try {
      validatedOrigin = new URL(refererHeader).origin;
    } catch (e) {
      // Invalid referer URL, ignore.
    }
  }

  const isAllowedOrigin =
    !validatedOrigin ||
    allowedOrigins.includes(validatedOrigin) ||
    allowedOriginPatterns.some((pattern) => pattern.test(validatedOrigin));

  // Allow requests without origin (same-origin requests) or validate origin
  if (!isAllowedOrigin) {
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

  if (validatedOrigin && isAllowedOrigin) {
    headers["Access-Control-Allow-Origin"] = validatedOrigin;
    headers["Vary"] = "Origin";
  }

  context.res = {
    status: 200,
    headers: headers,
    body: { token: token },
  };
};
