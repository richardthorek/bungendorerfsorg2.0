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

| # | Phase | Issue | Code status |
|---|-------|-------|-------------|
| 0 | Audit, baseline, wireframe, plan | #56 | Done |
| 1 | IA cleanup — remove duplicate summary cards | [#57](https://github.com/richardthorek/bungendorerfsorg2.0/issues/57) closed | Done |
| 2 | Adaptive hero + utility-bar move | [#58](https://github.com/richardthorek/bungendorerfsorg2.0/issues/58) closed | Done |
| 3 | Live status strip + map continuity | [#59](https://github.com/richardthorek/bungendorerfsorg2.0/issues/59) closed | Done |
| 4 | Spacing + typography token reductions | [#60](https://github.com/richardthorek/bungendorerfsorg2.0/issues/60) closed | Done |
| 5 | Footer flattening + scoped hover-lift | [#61](https://github.com/richardthorek/bungendorerfsorg2.0/issues/61) closed | Done |
| 6 | Asset dedupe, lazy map, CSS dead-code removal | [#62](https://github.com/richardthorek/bungendorerfsorg2.0/issues/62) **open** | Done — see [`docs/CSS_OPTIMIZATION.md`](docs/CSS_OPTIMIZATION.md) |
| 7 | Accessibility pass + final verification | [#63](https://github.com/richardthorek/bungendorerfsorg2.0/issues/63) **open** | Done |

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

| Programme | Status | Reference |
|-----------|--------|-----------|
| Security remediation (token logging, Logic Apps proxy, XSS, mapbox origin validation) | Done | [`SECURITY_FIXES.md`](SECURITY_FIXES.md) |
| Test infrastructure (Jest + Testing-Library) | Done | [`docs/TESTING.md`](docs/TESTING.md), `__tests__/` |
| CI (lint + test + audit on push/PR) | Done | `.github/workflows/ci.yml` |
| Calendar migration off Microsoft Graph to static content files | Done | `public/Content/communityEvents.json`, `trainingSchedule.json`; see README § Editing site content |

---

## Adding a new programme

Add a section above with: tracking issue, target outcome, scope in/out, phase table
with issue links, and a "remaining" checklist. Remove or fold a programme into "Other
programmes" once its tracking issue is closed and its docs are current.
