# Bungendore RFS Website 2.0 — Master Plan

> Single source of truth for in-flight work. Update on every PR that changes scope,
> status, or acceptance criteria.

**Maintainer:** @richardthorek

---

## Closed programme: UI/UX Redesign — "Command Centre" Home Page

**Tracking issue:** [#56](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56)
— closed 2026-08-31 (not planned). Child issues #57–#63 all closed.
**Outcome delivered:** home page is a compact, dense public-safety dashboard — nav +
adaptive hero + live status strip above the fold; calm conditions keep the hero
compact and image-led, active incidents switch it to a map-led state; no content
topic appears twice.

### What shipped

All seven implementation phases landed (squash-merged in #66, refined since).
Verified against `public/index.html`, `public/css/main.css`,
`public/js/tabs-accordion.js`, `public/js/emergency-dashboard.js`: duplicate
summary cards removed; adaptive hero + live status strip in place;
spacing/typography tokens reduced; footer flattened; Pico/Font Awesome imports
deduplicated; Mapbox GL lazy-loaded via `IntersectionObserver`; dead CSS pass
(`main.css` ~78.6 KB → ~58 KB); accessibility pass (skip link, roving-tabindex
tablist, contrast token bump, legacy ID-alias shim removed).

| #   | Phase                                         | Issue        | Status |
| --- | --------------------------------------------- | ------------ | ------ |
| 0–5 | Audit → footer flattening                     | #56–#61      | Done, issues closed as passing |
| 6   | Asset dedupe, lazy map, CSS dead-code removal | #62          | Implementation done; closed not-planned |
| 7   | Accessibility pass + final verification       | #63          | Implementation done; closed not-planned |

### Not done — deferred, not blocking

The programme was closed with the numeric verification never run. If it becomes
worth doing, file a fresh scoped issue:

- `main.css` is ~27% under baseline (53.1 KB) vs the 30% target; a second dead-CSS
  sweep took it there. The last ~2 KB needs markup/JS changes, not CSS deletion —
  see the note in [`docs/CSS_OPTIMIZATION.md`](docs/CSS_OPTIMIZATION.md).
- Lighthouse never run against the deployed home page (Perf ≥ 90 mobile,
  A11y ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.05) — [`docs/current_state/ui-baseline.md`](docs/current_state/ui-baseline.md) §6 still `_TBD_`.
- axe-core scan never run (needs a browser/CI). A static WCAG AA contrast audit
  *was* done and its failures fixed (muted-text token, dark-mode link colour,
  small red CTA/kicker text).
- 1920 px screenshot missing (360/768/1280 committed); no before/after diff.

Reference specs (target-state, not to be edited without re-verifying against the
current DOM): [`docs/current_state/ui-baseline.md`](docs/current_state/ui-baseline.md),
[`docs/current_state/ui-redesign.md`](docs/current_state/ui-redesign.md).

---

## Outstanding — owner action

The M365-migration and members'-area programmes below are **code-complete**. What
is left is manual teardown / config only the owner can do:

- **Twilio Studio** — point the `phoneNumbers` (calls) and `phoneNumbers2` (SMS)
  widgets at `/api/duty`, add `X-Duty-Key`, add the SMS-PIN Split/claim widgets;
  then retire `phoneNumberForwarding` and the `prod-00` SMS-lookup Logic App.
- **Delete** the disabled `formHandler` Logic App and the `getCalendar` Logic App,
  plus the `office365` / `office365-1` / `sharepointonline` / `teams` connections.
- Remove `AZURE_CALENDAR_WEBHOOK_URL` (and any `AZURE_CONTACT_WEBHOOK_URL`) from
  the Static Web App settings if still present.
- **TfNSW Live Traffic Hazards key** — sign up at
  https://opendata.transport.nsw.gov.au/ (reCAPTCHA-gated, human step) and set
  `TFNSW_API_KEY` as a Static Web App application setting. `/api/traffic-hazards`
  is fully wired and will start returning live data as soon as the key is set —
  no code change needed. Until then it honestly reports "unavailable" (503).

---

## Other programmes

| Programme                                                                             | Status | Reference                                                                                         |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Security remediation (token logging, Logic Apps proxy, XSS, mapbox origin validation) | Done   | [`SECURITY_FIXES.md`](SECURITY_FIXES.md)                                                          |
| Test infrastructure (Jest + Testing-Library)                                          | Done   | [`docs/TESTING.md`](docs/TESTING.md), `__tests__/`                                                |
| CI (lint + test + audit)                                                              | Done   | `.github/workflows/ci.yml`                                                                        |
| Calendar migration off Microsoft Graph to static content files                        | Done   | `public/Content/communityEvents.json`, `trainingSchedule.json`; see README § Editing site content |
| WEBSITE_ROADMAP Workstream 7 — new external feeds (BOM Fire Weather Warning, BOM wind/temp/humidity, BOM rain radar, TfNSW traffic hazards) | Backend done; TfNSW pending an API key (owner action); frontend kept minimal (text/image, no redesign). DEA satellite hotspots dropped — confusing for the general public | `docs/WEBSITE_ROADMAP.md` §3; `api/shared/externalFeeds.js`, `api/{fire-weather-warning,wind-observations,traffic-hazards}/` |
| Website Roadmap "Bet 2" — PWA + offline last-known-good (`public/sw.js`, localStorage last-known-good fallback in `emergency-data.js`, manifest completeness) | Done — service worker's real browser install/fetch lifecycle not yet manually verified (no browser available in dev sandbox) | [`docs/WEBSITE_ROADMAP.md`](docs/WEBSITE_ROADMAP.md) §4 |
| Error pipeline: App Insights exception / CI failure on `main` -> GitHub issue -> Claude auto-diagnosis -> draft PR (never auto-merges) | Code-complete, not yet deployed — needs `infra/modules/error-relay.bicep` deployed by hand (owner action, secrets required) and `CLAUDE_CODE_OAUTH_TOKEN` repo secret added | `infra/README.md` § "Error relay", `.github/workflows/{auto-diagnose,auto-diagnose-retry,create-issue-on-failure}.yml`; adapted from `richardthorek/Station-Manager`'s `docs/wiki/developer/error-pipeline-blueprint.md` |

---

## Delivered: Contact form email — off the retiring M365 tenant

**Target outcome:** the website contact form no longer depends on the
`bungendorerfs.onmicrosoft.com` tenant (SharePoint list + Office 365 mail +
Teams, all orchestrated by the `formHandler` Logic App). Instead `/api/contact`
sends a rich HTML notification straight to the RFS leadership distribution list
via Azure Communication Services Email, with an acknowledgement back to the
enquirer.

### Status

| Step                                                                                                                                  | State                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Root cause of "no enquiry details" found — proxy sent `message`, Logic App read `enquiry`; SharePoint `Description` always null       | Done                                   |
| `api/contact` + `server.js` rewritten to send via ACS, SharePoint/Teams/Logic App dropped                                             | Done — merged (#90)                    |
| ACS Email domain `notify.bungendorerfs.org` created, DNS added, verified + linked to `stationkit-comm`                                | Done                                   |
| SWA app settings + `formHandler` Logic App disabled + deploy verified                                                                 | Done                                   |
| Delete the disabled `formHandler` Logic App + `office365` / `office365-1` / `sharepointonline` / `teams` connections                  | Pending — after a few days' confidence |
| Historical enquiries imported from the SharePoint export (7 rows) and marked resolved; metadata (dates, contacts, assignee) preserved | Done                                   |

---

## Delivered: Members' area (auth · duty line · events · enquiries · Social Studio · Analytics)

**Target outcome:** a passwordless members' sign-in on the website that replaces the
Microsoft-365-dependent workflows — the SharePoint duty-phone lookup behind the
Twilio call/SMS forwarding flow, and the M365 calendar behind the training /
community-engagement feeds — with an allow-list and editing screens the brigade
controls.

**Approach:** email one-time code (via the existing ACS setup) + a short session
cookie; an allow-list in `brfsstorage`; only `@rfs.nsw.gov.au` addresses that are on
the list may sign in; 60-minute sessions. Chose this over an Entra External ID (CIAM)
tenant — simpler, no SWA Standard upgrade, and the allow-list is needed either way.

### Status

| Step                                                                                                                                                                                                                       | State                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PR 1 — auth core: sign-in codes, sessions, `members` allow-list + admin screen, audit log, seed script, tests                                                                                                              | Done — branch `feat/members-auth`     |
| First admin seeded (`richardthorek-vol@rfs.nsw.gov.au`) + SWA settings (`AUTH_JWT_SECRET`, `BRFS_STORAGE_CONNECTION`, `AUTH_ALLOWED_EMAIL_DOMAIN`, `AUTH_SESSION_MINUTES`)                                                 | Done                                  |
| PR 2 — `/api/duty` (public lookup + members set/status), duty screen, `DUTY_LOOKUP_KEY`; duty seeded `+61488880286`                                                                                                        | Done — branch `feat/duty-line`        |
| PR 2 cut-over — point the Twilio flow's `phoneNumbers` + `phoneNumbers2` widgets at `/api/duty`, add `X-Duty-Key`; retire `phoneNumberForwarding` + `prod-00` SMS lookup                                                   | Pending — owner, in the Twilio GUI    |
| PR 3 — brigade-phone change-alert email + `POST /api/duty/claim` (SMS-PIN) + member `phone` field                                                                                                                          | Done — branch `feat/duty-sms`         |
| PR 3 config — set `DUTY_CLAIM_PIN` / `DUTY_FALLBACK_NUMBER` / `DUTY_ALERT_TO` on the SWA; add the `Split` + claim widgets in the Twilio flow                                                                               | Pending — owner                       |
| PR 4 — events + training editing in the members' area (`/api/content/*`, `content` table); home page reads it via `calendar.js` with a bundled-JSON fallback; `api/calendar-events` + `AZURE_CALENDAR_WEBHOOK_URL` removed | Done — branch `feat/content-admin`    |
| PR 4 config — `node scripts/seed-content.js` against `brfsstorage`; remove `AZURE_CALENDAR_WEBHOOK_URL` from the SWA; retire the `getCalendar` Logic App                                                                   | Pending — owner                       |
| PR 5 — enquiries list in the members' area; contact form records to the `enquiries` table (still emails); `scripts/seed-enquiries.js` for #1–#28                                                                           | Done — branch `feat/enquiries`        |
| PR 6 — brigade-phone UX: name label + one-click quick-pick from previous numbers; dropped the session-timer; mobile header/nav layout fixes                                                                                | Done — branch `feat/brigade-phone-ux` |
| PR 7 — Social Studio: drag/resize graphic-template editor (canvas, PNG export, no persistence) + Azure OpenAI copy-drafting chat (optional photo attachment, vision) with a hard-coded JSON contract and admin-editable voice/rules guidelines (`api/social-chat`, `api/social-prompt`, `content` table `settings` partition); server-side keyword safety backstop runs regardless of the editable guidelines; posting stays copy/paste into Meta Business Suite — no Graph API integration | Done — branch `claude/admin-social-media-tool-ndmblv` |
| PR 7 config — set `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` (a vision-capable chat deployment) / `AZURE_OPENAI_API_VERSION` on the SWA                                                  | Done — `brfs-openai` (Azure OpenAI, australiaeast, RG `BungendoreRFS`), deployment `gpt-5.6-terra` (GlobalStandard); API version `2024-10-21` (GA; json_object + vision + reasoning_effort verified end-to-end). GPT-5 reasoning models reject `temperature`/`max_tokens`, so `api/shared/aiCopy.js` now sends `max_completion_tokens` + `reasoning_effort` (`low`). 4 settings live on `bungendorerfs-static` |
| PR 7 follow-up — collapsed the separate "chat reply" / "draft post copy" round-trips into one `chatTurn` call returning `{message, draft}`; admin UI now shows the chat thread and a live-updating draft panel side by side instead of a chat-then-click-to-draft flow                                                  | Done — branch `claude/ai-copy-response-structure-cne5xe` |
| PR 8 — Microsoft Clarity: analytics tag on `public/index.html` (project `yaxo089b41`, public site only — not `admin.html`); "Analytics" tab in the members' area reading the Clarity Data Export API via `api/clarity` (+ `server.js` mirror). Rolling 3-day window normalised to a stable summary and stored in a new `analytics` table (`latest` + one `day:<date>` rollup row) so the trend outlives Clarity's own retention. Refresh is opportunistic off members'-area traffic (`maybeRefreshClarity` fired from `handleAuthMe` + the panel), gated to ≥6h apart and ≤6 pulls/UTC-day (Clarity's cap is 10) | Done — branch `feat/site-analytics` (PR #105) |
| PR 8 config — set `CLARITY_API_TOKEN` on the SWA | Done — live on `bungendorerfs-static` (set with `az staticwebapp appsettings set`, like every other members'-area setting; `infra/main.bicep` no longer manages app settings — see `infra/README.md`). Data stays empty until the Clarity tag has production traffic |
| PR 9 — Alert banner (roadmap `docs/WEBSITE_ROADMAP.md` §4 "Bet 3"): new `alertBanner` content key (`api/shared/contentSchema.js`, `handlers.js`), 0-or-1-item banner shown near the top of `#liveStatusStrip` on the public home page (`public/js/alert-banner.js`), "Alert banner" editor in the members' area with a non-dismissible governance notice (`public/admin.html`/`admin.js`). `postedAt` stamped server-side, never client-trusted. `GET /api/content/{key}` made public for a named allow-list (`events`, `training`, `alertBanner`) rather than all keys; `PUT` stays session-gated for every key | Done — branch `bet3-alert-banner` |
| PR 9 follow-up — brigade governance: agree who's authorised to post, wording norms, and a take-down expectation for stale banners; the admin UI notice is a prompt, not a substitute for an actual process | Pending — owner |

Twilio flow notes: inbound calls hit widget `phoneNumbers` → `prod-08` Logic App
`32aded0a…`; inbound SMS hit `phoneNumbers2` → `prod-00` Logic App `86da0e0d…` and
are forwarded to the duty officer with an auto-reply. Call fallback is hardcoded
`+61419983748`. Both HTTP widgets need their URL pointed at `/api/duty`.

---

## Adding a new programme

Add a section above with: tracking issue, target outcome, scope in/out, phase table
with issue links, and a "remaining" checklist. Remove or fold a programme into "Other
programmes" once its tracking issue is closed and its docs are current.
