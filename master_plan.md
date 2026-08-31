# Bungendore RFS Website 2.0 — Master Plan

> Single source of truth for in-flight work. Update on every PR that changes scope,
> status, or acceptance criteria.

**Maintainer:** @richardthorek

---

## Active programme: UI/UX Redesign — "Command Centre" Home Page

**Tracking issue:** [#56](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56)
**Target outcome:** home page as a compact, dense public-safety dashboard — nav +
adaptive hero + live status strip above the fold. Calm conditions keep the hero
compact and image-led; active incidents switch it to a map-led state. No content
topic appears twice.

### Status

All seven implementation phases have landed in code (verified against
`public/index.html`, `public/css/main.css`, `public/js/tabs-accordion.js`,
`public/js/emergency-dashboard.js`): the duplicate summary cards are gone, the
adaptive hero and live status strip are in place, spacing/typography tokens were
reduced, the footer was flattened, Pico/Font Awesome imports were deduplicated,
Mapbox GL is lazy-loaded via `IntersectionObserver`, dead CSS was removed
(`main.css` down from ~78.6 KB to ~58 KB), and the accessibility pass (skip link,
roving-tabindex tablist, contrast fixes, legacy ID-alias shim removal) is in place.

| #   | Phase                                         | Issue                                                                          | Code status                                                       |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 0   | Audit, baseline, wireframe, plan              | #56                                                                            | Done                                                              |
| 1   | IA cleanup — remove duplicate summary cards   | [#57](https://github.com/richardthorek/bungendorerfsorg2.0/issues/57) closed   | Done                                                              |
| 2   | Adaptive hero + utility-bar move              | [#58](https://github.com/richardthorek/bungendorerfsorg2.0/issues/58) closed   | Done                                                              |
| 3   | Live status strip + map continuity            | [#59](https://github.com/richardthorek/bungendorerfsorg2.0/issues/59) closed   | Done                                                              |
| 4   | Spacing + typography token reductions         | [#60](https://github.com/richardthorek/bungendorerfsorg2.0/issues/60) closed   | Done                                                              |
| 5   | Footer flattening + scoped hover-lift         | [#61](https://github.com/richardthorek/bungendorerfsorg2.0/issues/61) closed   | Done                                                              |
| 6   | Asset dedupe, lazy map, CSS dead-code removal | [#62](https://github.com/richardthorek/bungendorerfsorg2.0/issues/62) **open** | Done — see [`docs/CSS_OPTIMIZATION.md`](docs/CSS_OPTIMIZATION.md) |
| 7   | Accessibility pass + final verification       | [#63](https://github.com/richardthorek/bungendorerfsorg2.0/issues/63) **open** | Done                                                              |

### Remaining before #56 closes

Implementation is complete; what's left is verification evidence, not code:

- [ ] Run Lighthouse against the deployed home page (Performance ≥ 90 mobile,
      Accessibility ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.05) and record results in
      [`docs/current_state/ui-baseline.md`](docs/current_state/ui-baseline.md) §6.
- [ ] Run an axe-core scan and confirm zero serious/critical violations.
- [ ] Close #62 and #63 once the above is recorded (both have passing code, just
      need their acceptance-criteria evidence attached).

Reference specs (target-state, not to be edited without re-verifying against the
current DOM): [`docs/current_state/ui-baseline.md`](docs/current_state/ui-baseline.md),
[`docs/current_state/ui-redesign.md`](docs/current_state/ui-redesign.md).

---

## Other programmes

| Programme                                                                             | Status | Reference                                                                                         |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Security remediation (token logging, Logic Apps proxy, XSS, mapbox origin validation) | Done   | [`SECURITY_FIXES.md`](SECURITY_FIXES.md)                                                          |
| Test infrastructure (Jest + Testing-Library)                                          | Done   | [`docs/TESTING.md`](docs/TESTING.md), `__tests__/`                                                |
| CI (lint + test + audit on push/PR)                                                   | Done   | `.github/workflows/ci.yml`                                                                        |
| Calendar migration off Microsoft Graph to static content files                        | Done   | `public/Content/communityEvents.json`, `trainingSchedule.json`; see README § Editing site content |

---

## Active programme: Contact form email — migrate off the retiring M365 tenant

**Target outcome:** the website contact form no longer depends on the
`bungendorerfs.onmicrosoft.com` tenant (SharePoint list + Office 365 mail +
Teams, all orchestrated by the `formHandler` Logic App). Instead `/api/contact`
sends a rich HTML notification straight to the RFS leadership distribution list
via Azure Communication Services Email, with an acknowledgement back to the
enquirer.

### Status

| Step                                                                                                                                                              | State                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Root cause of "no enquiry details" found — proxy sent `message`, Logic App read `enquiry`; SharePoint `Description` always null                                   | Done                                   |
| `api/contact` + `server.js` rewritten to send via ACS, SharePoint/Teams/Logic App dropped                                                                         | Done — merged (#90)                    |
| ACS Email domain `notify.bungendorerfs.org` created, DNS added, verified + linked to `stationkit-comm`                                                            | Done                                   |
| SWA app settings + `formHandler` Logic App disabled + deploy verified                                                                                             | Done                                   |
| Delete the disabled `formHandler` Logic App + `office365` / `office365-1` / `sharepointonline` / `teams` connections                                              | Pending — after a few days' confidence |
| Historical enquiries #1–#28 seeded into the `enquiries` table via `scripts/seed-enquiries.js` (3 recovered in `scripts/data/…`; the rest need old-tenant sign-in) | Pending — owner                        |

---

## Active programme: Members' area + duty-line + events, off the retiring M365 tenant

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

Twilio flow notes: inbound calls hit widget `phoneNumbers` → `prod-08` Logic App
`32aded0a…`; inbound SMS hit `phoneNumbers2` → `prod-00` Logic App `86da0e0d…` and
are forwarded to the duty officer with an auto-reply. Call fallback is hardcoded
`+61419983748`. Both HTTP widgets need their URL pointed at `/api/duty`.

---

## Adding a new programme

Add a section above with: tracking issue, target outcome, scope in/out, phase table
with issue links, and a "remaining" checklist. Remove or fold a programme into "Other
programmes" once its tracking issue is closed and its docs are current.
