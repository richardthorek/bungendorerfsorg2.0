# Bungendore RFS Website 2.0 — Master Plan

> Single source of truth for in-flight work. Update on every PR that changes scope, status, or acceptance criteria. Each phase below maps to one or more GitHub issues.

**Last updated:** 2026-04-23 · **Maintainer:** @richardthorek

---

## Active programme: UI/UX Redesign — "Command Centre" Home Page

**Tracking issue:** [#56 Comprehensive UI/UX Assessment and Redesign Plan](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56)
**Topic branch root:** `claude/fix-dynamic-site-elements-loading` (Phase 0)
**Target outcome:** Home page becomes a compact, dense public-safety dashboard. Above-the-fold (1280×800) shows nav + adaptive hero + live status strip. In calm conditions the hero remains compact and image-led; when one or more active incidents exist, the hero switches to a map-led incident state with deconflicted heading content. No content topic appears twice. Total page height reduced ≥ 35%, `main.css` reduced ≥ 30%, Lighthouse Performance ≥ 90 mobile / Accessibility ≥ 95.

### Intent
Surface the four high-stakes facts (fire danger rating, active local incidents, current warning level, total fire ban status) immediately, with one map glance and one click to "what to do next". The map should become the primary visual surface when incidents are active, instead of being relegated to a thumbnail. Everything else is reachable in ≤ 2 interactions via the existing tab/accordion shell.

### Scope (in)
- `public/index.html` structure (hero, status surfaces, summary cards, footer markup).
- `public/css/main.css` tokens, scope of hover/animation rules, dead-rule removal.
- Asset loading order in `public/index.html` `<head>` and end-of-body scripts.
- JS that maintains duplicated emergency state: `public/js/emergency-dashboard.js`, `public/js/main.js`, `public/js/dynamicContent.js`, `public/js/map.js`, `public/js/tabs-accordion.js`.
- Accessibility (skip link, contrast, tablist keyboard handling, focus order).

### Scope (out)
- Backend / Azure Functions in `api/`.
- Content rewrites in `public/Content/` (copy stays as-is unless layout demands).
- Auth, forms, contact webhook plumbing — already addressed by SECURITY_FIXES.md.
- Any change to deployment workflow.

### Phases

| # | Phase | Status | PR | Owner | Issue |
|---|-------|--------|----|-------|-------|
| 0 | Audit, baseline, wireframe preview, plan | **Ready for Phase 1** | _this branch_ | richardthorek + Claude (analysis) | #56 |
| 1 | IA cleanup — remove duplicate summary cards | **Done** | copilot/redesign-phase-1-ia-cleanup | Copilot | #57 |
| 2 | Adaptive hero + utility-bar move for secondary CTAs | **Done** | copilot/redesign-phase-2-adaptive-hero | Copilot | #56 |
| 3 | Live status strip + map continuity — replaces fire-info card + header status bar + emergency overlay | In progress | copilot/redesign-phase-3-live-status-strip | Copilot | #56 |
| 4 | Spacing + typography token reductions | **Done** | copilot/redesign-phase-4-spacing-typography | Copilot | #56 |
| 5 | Footer flattening + scoped hover-lift + header polish | Not started | — | worker agent | TBD |
| 6 | Asset dedupe (Pico, FA), lazy map, CSS dead-code removal | Not started | — | worker agent | TBD |
| 7 | Accessibility pass + final Lighthouse + after-screenshots | **Done** | copilot/implement-accessibility-pass-phase-7 | Copilot | #56 |

Phase 0 deliverables (this PR):
- [x] [docs/current_state/ui-baseline.md](docs/current_state/ui-baseline.md) — quantified baseline + evidence map.
- [x] [docs/current_state/ui-redesign.md](docs/current_state/ui-redesign.md) — target-state spec, token diff, ID-aliasing strategy, per-PR acceptance criteria.
- [x] [docs/current_state/wireframe/index.html](docs/current_state/wireframe/index.html) — interactive wireframe: current vs future, 360 / 768 / 1280 / 1920 breakpoints, annotations, height delta read-out. Open in any browser; no server required.
- [x] master_plan.md (this file) — programme tracker.
- [ ] Lighthouse run on production home page — recorded in `docs/current_state/ui-baseline.md` once executed (worker agent follow-up; not blocking Phase 1).

Phase 7 deliverables:
- [x] Visible skip link (`<a href="#main" class="skip-link">`) added as first focusable element.
- [x] `id="main"` added to `<main>` element (skip link target).
- [x] Coloured header h3 font-size raised to 1.2rem (≥14pt bold = WCAG "large text" → 3:1 AA).
- [x] Roving `tabindex` implemented in `tabs-accordion.js` (init: active=0/others=-1; arrow keys update tabindex + focus; explicit Enter/Space activation).
- [x] `aria-label` added to `[role="tablist"]`; `aria-hidden="true"` on decorative icons.
- [x] `id` attributes added to tab buttons; `aria-labelledby` on tab panels updated to use button IDs.
- [x] Legacy ID alias shim (9 hidden elements) removed from `index.html`.
- [x] `emergency-dashboard.js` cleaned up — legacy alias writes removed.
- [x] `main.js` fixed — fire-danger fetch no longer blocked by `fireMessages` element.
- [x] After-screenshots committed: `docs/current_state/images/ui-redesign-20260423-{360,768,1280}.png`.

### Done in Phase 0
- Confirmed structural duplication (index.html L230–354 vs L358–533) — see baseline doc.
- Quantified spacing tax (~7 rem of pure whitespace between hero and first content) — see baseline doc.
- Confirmed three duplicated emergency surfaces with four parallel DOM IDs (`statusBarDangerLevel`, `dashboardDangerLevel`, `mobileDangerLevel`, `fireDangerRatingCell`).
- Confirmed asset bloat: 2 Pico stylesheets, 2 Font Awesome bundles, `main.css` = 72 KB / 2861 lines, `index.html` = 28 KB / 664 lines.
- Locked in target spacing + type tokens (see redesign doc §3, §4).
- Designed ID-alias compatibility shim so JS in Phases 3–5 keeps working through the transition.
- Updated the future-state direction so active incidents promote the map into the hero rather than leaving it as a minor strip thumbnail.

### Blockers
- None. Worker agent can begin Phase 1 now; Lighthouse capture and baseline screenshots are follow-up evidence tasks, not implementation blockers.

### Next steps (after this PR merges)
1. Begin Phase 1 ([#57](https://github.com/richardthorek/bungendorerfsorg2.0/issues/57)) on its own feature branch off `liveDev`.
2. Worker agent runs Lighthouse on production home page, fills numbers into `docs/current_state/ui-baseline.md` §6.
3. Worker agent captures baseline screenshots at the four breakpoints.
4. Continue Phases 2–7 via the linked child issues under [#56](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56).

### Risks & rollback
- **Risk:** removing summary cards (Phase 1) may surprise returning users. **Mitigation:** the four tab-nav buttons cover the same entry points; ship behind single-commit revert window.
- **Risk:** status-strip consolidation (Phase 3) touches three JS files. **Mitigation:** keep existing element IDs as hidden aliases for one release; remove in Phase 7. ID-alias map is in `docs/current_state/ui-redesign.md` §6.
- **Rollback:** every phase ships as one independently revertable PR. Phase 1 and Phase 3 are the only semantic-changing PRs; both revert cleanly with `git revert`.

---

## Other in-flight programmes

| Programme | Status | Tracking |
|-----------|--------|----------|
| Security fixes (Phase 1 — token logging, Logic Apps proxy, XSS, mapbox endpoint) | In progress | [SECURITY_FIXES.md](SECURITY_FIXES.md), docs/REVIEW_SUMMARY.md |
| Test infrastructure bootstrap | Not started | docs/CODEBASE_REVIEW.md Issue #8 |
| CI: lint + test + audit on PRs | Not started | docs/CODEBASE_REVIEW.md Issue #10 |

---

## Convention changes adopted in this programme
The redesign mutates global design tokens. When Phase 4 lands, update `.github/copilot-instructions.md` "Coding Conventions and Standards" section with the new spacing scale and type scale. Token diff is in `docs/current_state/ui-redesign.md` §3–§4.
