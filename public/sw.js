/**
 * Service worker — Bet 2 "PWA + offline last-known-good" (WEBSITE_ROADMAP.md
 * §4). Two jobs, kept deliberately separate from the server-side cache in
 * `api/shared/fireDataProxy.js`:
 *
 *   1. App shell (HTML/CSS/JS/images) — cache-first with a background
 *      network refresh (stale-while-revalidate), so the page itself loads
 *      instantly offline instead of showing the browser's own offline page.
 *   2. Live emergency-data API responses (`/api/fire-danger`,
 *      `/api/fire-incidents`) — network-first with a cache fallback: always
 *      prefer a live read, but if the network is unreachable, serve the last
 *      response this browser saw so `emergency-data.js` has something to
 *      render instead of nothing.
 *
 * The server-side cache in fireDataProxy.js only helps when a request
 * *reaches* the Function/Express host. This worker exists for the case the
 * roadmap calls out explicitly: a fully offline client where no request
 * reaches the server at all.
 *
 * ── CACHE VERSIONING — READ THIS BEFORE YOU DEPLOY A CHANGE ──────────────
 *
 * `CACHE_VERSION` below is the ONLY thing that busts old caches. Bump it
 * (e.g. "v1" -> "v2") whenever you:
 *   - change the list of files in APP_SHELL_ASSETS,
 *   - ship an index.html/CSS/JS change you need every client to pick up
 *     promptly (rare — stale-while-revalidate already refreshes in the
 *     background on the next load, but a version bump forces an immediate
 *     clean cache rather than a mix of old+new assets across the two caches
 *     below), or
 *   - change this file's caching *logic* in a way that makes old cache
 *     entries invalid or wrong (e.g. a different request/response shape).
 *
 * On `activate`, this worker deletes every cache whose name doesn't match
 * the current CACHE_VERSION, so bumping the version is enough — you do not
 * need to (and should not try to) manually clear caches for users. Do NOT
 * reuse an old version string after bumping forward.
 *
 * If you DON'T bump the version, browsers may keep serving old app-shell
 * assets from cache indefinitely to clients who already have this worker
 * installed (stale-while-revalidate mitigates this for content, but a new
 * service-worker.js itself is only re-checked by the browser periodically,
 * and activation of a new worker version is what actually cleans up).
 */

const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = "bungendore-rfs-shell-" + CACHE_VERSION;
const API_CACHE = "bungendore-rfs-api-" + CACHE_VERSION;
const CURRENT_CACHES = [APP_SHELL_CACHE, API_CACHE];

// Minimal, safe-to-precache app shell. Deliberately does NOT try to
// enumerate every image/content file — those are picked up opportunistically
// by the fetch handler's cache-as-you-go behaviour below, so a missing entry
// here is not a correctness bug, just a slightly colder first offline visit.
const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/css/main.css",
  "/js/error-handler.js",
  "/js/emergency-dashboard.js",
  "/js/main.js",
  "/js/emergency-data.js",
  "/js/fire-weather-warning.js",
  "/js/wind-observations.js",
  "/js/alert-banner.js",
  "/js/nearest-incident.js",
  "/js/map.js",
  "/js/modal-utils.js",
  "/js/contact.js",
  "/js/dynamicContent.js",
  "/js/fire-info-section.js",
  "/js/awareness-cards.js",
  "/js/vendor/marked.min.js",
  "/js/vendor/luxon.min.js",
  "/js/vendor/purify.min.js",
  "/site.webmanifest",
];

// API routes that get network-first-with-cache-fallback treatment. Anything
// else under /api/ (auth, admin, contact submission, etc.) is intentionally
// left to the network only — those are not "last-known-good" data, and
// caching a stale auth/session response would be actively wrong.
const CACHEABLE_API_PATHS = ["/api/fire-danger", "/api/fire-incidents"];

function isAppShellRequest(url) {
  return (
    url.origin === self.location.origin &&
    (APP_SHELL_ASSETS.includes(url.pathname) ||
      url.pathname.startsWith("/css/") ||
      url.pathname.startsWith("/js/") ||
      url.pathname.startsWith("/Images/") ||
      url.pathname.startsWith("/Content/"))
  );
}

function isCacheableApiRequest(url) {
  return url.origin === self.location.origin && CACHEABLE_API_PATHS.includes(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) =>
        // addAll fails the whole install if any single asset 404s — use
        // individual best-effort puts so one missing/renamed file doesn't
        // block the worker from ever installing.
        Promise.all(
          APP_SHELL_ASSETS.map((asset) =>
            cache.add(asset).catch((err) => {
              console.warn("[sw] precache skipped for", asset, err && err.message);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Stale-while-revalidate: serve the cached response immediately if present,
 * kick off a network fetch in the background to refresh the cache for next
 * time. If there's no cached copy yet, fall back to waiting on the network.
 */
function staleWhileRevalidate(request) {
  return caches.open(APP_SHELL_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null); // offline background refresh failing is fine — we already served cache

      if (cached) {
        networkFetch.catch(() => {}); // don't create an unhandled rejection; caller already has a response
        return cached;
      }
      return networkFetch.then((response) => response || Response.error());
    })
  );
}

/**
 * Network-first with cache fallback: always try the network first for live
 * emergency data, only falling back to the last cached response if the
 * network request fails outright (offline, DNS failure, timeout, etc.).
 * A non-2xx HTTP response is passed through as-is rather than masked by a
 * stale cache read — that's the server's own honest-error path
 * (fireDataProxy.js / emergency-data.js's renderDegraded), not something
 * this layer should paper over.
 *
 * IMPORTANT: a cache-fallback response is tagged with `X-SW-Served-From:
 * cache` before it's returned. Without this, the calling page's fetch()
 * simply resolves successfully and has no way to tell "genuinely live" apart
 * from "this device (or the server) just had a network failure and you're
 * looking at whatever this browser last saw" — which is precisely the
 * "stale data rendered as if live" failure this whole roadmap exists to
 * eliminate. emergency-data.js checks for this header and renders its own
 * honest offline/stale state instead of treating the response as fresh.
 * A Response's headers can't be mutated in place once read from the Cache
 * API, so this reconstructs a new Response with the extra header.
 */
function networkFirstWithCacheFallback(request) {
  return caches.open(API_CACHE).then((cache) =>
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() =>
        cache.match(request).then((cached) => {
          if (!cached) {
            throw new Error("Network request failed and no cached response is available");
          }
          const headers = new Headers(cached.headers);
          headers.set("X-SW-Served-From", "cache");
          return cached.blob().then(
            (body) =>
              new Response(body, {
                status: cached.status,
                statusText: cached.statusText,
                headers: headers,
              })
          );
        })
      )
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never intercept writes (auth, contact, admin POSTs)

  const url = new URL(request.url);

  if (isCacheableApiRequest(url)) {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }

  if (isAppShellRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else (cross-origin CDNs, other /api/* routes) is left to the
  // browser's normal network handling — no interception.
});
