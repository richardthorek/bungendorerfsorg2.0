# UI Redesign Spec — "Command Centre" Home Page (Future State)

**Created:** 2026-04-23 · **Tracking issue:** [#56](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56) · **Companion docs:** [ui-baseline.md](ui-baseline.md), [wireframe/index.html](wireframe/index.html)

This document is the **definition of done** for the redesign. Each section maps to one PR; a worker agent will read this top-to-bottom and execute. Acceptance criteria are testable from `git diff` + a browser at the four standard breakpoints (360 / 768 / 1280 / 1920).

---

## 1. Target composition (top → bottom)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Utility bar (40 px)  ·  RFS · Permits · Donate · Contact · FB · IG  │ ← phase 2
├──────────────────────────────────────────────────────────────────────┤
│ Nav (56 px)          logo  ·  Fire Info · Prepare · Membership · …  │
├──────────────────────────────────────────────────────────────────────┤
│ HERO (38vh, 340–480 px)                                              │
│   Calm state: photo/text hero + ONE primary CTA                      │ ← phase 2
│   Incident state: map-led hero + deconflicted heading panel          │ ← phase 2
├──────────────────────────────────────────────────────────────────────┤
│ LIVE STATUS STRIP — flush, full-width, 1 row × 5 cells @ ≥ 900 px    │
│ ┌──────┬──────────┬─────────┬─────────┬────────────────────────┐     │
│ │Danger│Incidents │Warning  │TOBAN    │ Map context / CTA      │     │ ← phase 3
│ │Rating│ count + d│ level   │ Y / N   │  hero sync / full map  │     │
│ └──────┴──────────┴─────────┴─────────┴────────────────────────┘     │
├──────────────────────────────────────────────────────────────────────┤
│ TAB NAVIGATION  ·  Fire Info | Prepare | Membership | Events         │ ← phase 1 keeps
├──────────────────────────────────────────────────────────────────────┤
│ Active tab panel (full content for the selected topic)               │
├──────────────────────────────────────────────────────────────────────┤
│ Footer — flat 4-column row of <section>s, no card chrome             │ ← phase 5
└──────────────────────────────────────────────────────────────────────┘
```

**Above-the-fold @ 1280×800:** Utility (40) + Nav (56) + Hero (340–480) + Status strip (160) ≈ 600–730 px → **all of it visible without scrolling**, status data first-paint.

**Below 600 px viewport:** strip becomes a 2 × 2 grid + map cell collapses to a "View Map" button in cell 5; hero shrinks to ~260 px; utility bar collapses into a hamburger overflow. In incident state, the hero remains map-led but the heading panel becomes an inset card anchored to the top or bottom edge.

---

## 2. Per-phase scope, files, and acceptance criteria

> Worker agent: each phase = one PR off `liveDev`. Title format: `Redesign Phase N: <short name> (#56)`.

### Phase 1 — IA cleanup (kill duplication)
**Files:** `public/index.html`
**Changes:**
- Remove the 3-up `summaryCard` row (Prepare / Membership / Events) at [L310–354](../../public/index.html#L310-L354). Keep the tab navigation as the single entry point.
- Keep the Fire Info `summaryCard` for now (Phase 3 will replace it with the status strip). Add a `<!-- TODO Phase 3: replaced by status strip -->` comment to flag.
- Update `<nav id="mainNav">` `<ul>` to scroll to the tab buttons (not to deep-anchored sections inside tab panels), since the section anchors `#prepare`, `#membership`, `#events` will live inside hidden tab panels.

**Acceptance:**
- `grep -c "summaryCard" public/index.html` returns ≤ 2 (was 4: Fire Info + Prepare + Membership + Events).
- No content topic appears twice in `public/index.html` outside the canonical tab panel.
- Clicking a top-nav link selects the corresponding tab and scrolls the tab nav into view.
- Visual diff @ 1280: home page is ~220 px shorter (the 3-up row removed).

### Phase 2 — Adaptive hero + utility bar for secondary CTAs
**Files:** `public/index.html`, `public/css/main.css`
**Changes:**
- Token diff (in `:root`):
  ```diff
  - --hero-height: 60vh;
  - --hero-min-height: 500px;
  - --hero-max-height: 700px;
  + --hero-height: 38vh;
  + --hero-min-height: 340px;
  + --hero-max-height: 480px;
  ```
- `.hero hgroup.heading-background` padding: `var(--space-xl)` → `var(--space-md)`.
- Hero contains: logo, H1, hero-cta paragraph, **one** primary CTA. Remove `.button-container` from hero entirely.
- Move the four secondary buttons (RFS Website, Permits, Donate, Contact) and two social icons into a new `<div id="utilityBar">` placed **above** `<nav id="mainNav">`. On `< 768 px`, the utility bar collapses into an overflow menu.
- Remove `.hero::after` bounce indicator, OR gate it behind a JS check that only shows it when `window.scrollY === 0 && document.documentElement.scrollHeight > window.innerHeight + 200`.
- Make the hero **stateful**:
  - **Calm / no-incident state:** current redesign direction holds — photo or branded visual, heading copy, one primary CTA.
  - **Incident-active state:** if one or more incidents exist, the hero background becomes a live map surface (or a static preview derived from the current incident map) with a compact content panel overlaid in a reserved safe zone. The content panel contains brigade name, incident count, nearest-incident distance, and the primary CTA.
- Deconflict heading content from the map by reserving a fixed overlay zone (`top-left` on desktop, full-width inset card on mobile) and limiting the overlay width so incident markers remain visible.

**Acceptance:**
- `--hero-height` value in `main.css` is `38vh`.
- Hero contains exactly 1 `<a>` or `<button>` with `class~="custom-button"` (the primary CTA).
- Utility bar exists at top of `<header>` and contains the four secondary CTAs + two social icons.
- When there are **0 incidents**, hero renders the compact branded/photo state.
- When there is **≥ 1 incident**, hero renders the map-led incident state with a deconflicted content panel.
- Above-the-fold @ 1280×800 includes nav + adaptive hero + reserved strip area without scrolling.

### Phase 3 — Live status strip + map continuity (replaces fire-info card + header status bar + emergency overlay)
**Files:** `public/index.html`, `public/css/main.css`, `public/js/emergency-dashboard.js`, `public/js/main.js`, `public/js/dynamicContent.js`, `public/js/map.js`
**Changes:**
- Insert `<section id="liveStatusStrip" class="live-status-strip" aria-label="Current fire status for our area">` **immediately after** the hero, flush (no top margin, no negative margin hack).
- Strip contains five focusable cells, each `<article role="group">` with an `aria-label`:
  1. **Fire Danger Rating** — colour band background; large value; sub-label.
  2. **Active Incidents** — count + nearest distance (km).
  3. **Current Warning Level** — Advice / Watch & Act / Emergency / None; colour-coded.
  4. **Total Fire Ban** — Y/N badge; date range when active.
  5. **Map context cell** — in calm state this can be a compact map thumbnail or "View Map" CTA; in incident-active state it becomes a continuity cell that explains the hero map extent, selected incident, or "Open full incident map" action.
- Remove `#emergencyStatusBar`, `#emergencyDashboard`, `#mobileEmergencyPanel`, `#mobileEmergencyBadge` markup from `<header>`.
- Remove `#fireInfoSummaryCard` (the in-page card from L228–307).
- Remove `#fireInfoSummaryCard.status-panel { margin-top: -8rem }` rule from CSS.
- **ID-alias compatibility shim** (single release window): inside the strip, include visually-hidden `<span hidden>` elements for the legacy IDs listed in [ui-baseline.md §5](ui-baseline.md#5-id-inventory--what-the-new-status-strip-must-preserve-or-alias). JS files continue to write to those IDs unchanged. Phase 7 removes the aliases after JS migration.
- Keep the hero map and strip in sync: selecting an incident from the strip or map context cell updates the hero-map focus state and the Fire Info tab map state.
- Below 600 px: strip collapses to 2 × 2 grid; cell 5 becomes a single "View Map →" button.

**Acceptance:**
- `<section id="liveStatusStrip">` exists, sits between hero and tab nav.
- All four old emergency-surface containers (`#emergencyStatusBar`, `#emergencyDashboard`, `#mobileEmergencyPanel`, `#mobileEmergencyBadge`) removed from `index.html`.
- `#fireInfoSummaryCard` removed from `index.html`.
- All legacy DOM IDs from [ui-baseline.md §5](ui-baseline.md#5-id-inventory--what-the-new-status-strip-must-preserve-or-alias) still resolvable via `document.getElementById(...)` (alias shim).
- No `margin-top: -8rem` (or any negative margin > 1 rem) anywhere in `main.css`.
- In incident-active state, the hero visibly uses the incident map as the dominant visual surface instead of a static photo.
- @ 1280×800 the strip is fully visible without scrolling.

### Phase 4 — Spacing + typography token reductions
**Files:** `public/css/main.css`
**Changes:**
```diff
- --space-md: 1rem;
- --space-lg: 1.5rem;
- --space-xl: 2rem;
- --space-xxl: 3rem;
- --space-xxxl: 4rem;
+ --space-md: 0.75rem;
+ --space-lg: 1rem;
+ --space-xl: 1.5rem;
+ --space-xxl: 2rem;
+ --space-xxxl: 2.5rem;

- --pico-card-padding: var(--space-lg);
+ --pico-card-padding: var(--space-md);

- --font-size-h1: 3rem;
- --font-size-h2: 2.25rem;
- --font-size-h3: 1.5rem;
- --font-size-h4: 1.25rem;
+ --font-size-h1: 2.25rem;   /* hero only */
+ --font-size-h2: 1.5rem;
+ --font-size-h3: 1.125rem;
+ --font-size-h4: 1rem;      /* with font-weight 600 */

- --pico-line-height: 1.6;
+ --pico-line-height: 1.5;
```
- Article default `margin-bottom`: `var(--space-xl)` → `var(--space-lg)`.
- Heading top margins: `1.5rem` → `var(--space-md)`.
- Add utility class:
  ```css
  .tabular-nums { font-variant-numeric: tabular-nums; }
  ```
  Apply to all numeric KPI cells in the status strip.

**Acceptance:**
- Token values match exactly.
- `.tabular-nums` exists and is applied to status-strip numeric cells.
- Snapshot diff: home page total height reduced ≥ 35% vs baseline.

### Phase 5 — Footer flatten + scoped hover-lift + header polish
**Files:** `public/index.html`, `public/css/main.css`
**Changes:**
- Replace `<article id="pageFoot" class="container-fluid grid">` and its 4 nested `<article>` children with `<section id="pageFoot" class="footer-row">` containing 4 `<section>` children. No `<article>` inside `#footer`.
- Footer CSS: `display: flex; gap: var(--space-lg);` flat row with 1 px top divider; remove card padding/border/shadow inside footer.
- Scope the universal hover-lift:
  ```diff
  - article:hover, .content-section:hover, .summaryCard:hover {
  + .summaryCard:hover, .tab-panel article:hover, .live-status-strip article:hover {
       transform: translateY(-4px);
       box-shadow: 0 8px 16px rgba(0,0,0,.12);
    }
  ```
- Standardise coloured card headers (`.red`, `.amber`, `.blue`, `.lime`): `padding: var(--space-sm) var(--space-md)`, single H4 size, icon + label inline, action chevron right-aligned.
- Add 1 px subtle dividers between status-strip cells (instead of large gaps).

**Acceptance:**
- `<footer>` contains zero `<article>` elements.
- `grep "article:hover" public/css/main.css` returns 0; the hover rule is on `.summaryCard:hover, .tab-panel article:hover, .live-status-strip article:hover`.
- Hovering a footer cell does not transform it.

### Phase 6 — Asset dedupe + lazy map + CSS dead-code
**Files:** `public/index.html`, `public/css/main.css`, `public/js/map.js`
**Changes:**
- `<head>`: remove the duplicate Pico stylesheet (keep one — recommended: keep `@picocss/pico@2/css/pico.colors.min.css` only if its colours are actually used; otherwise keep the `latest` main bundle and drop the colours add-on).
- Remove FA 5.15.4 (`L21–22`); keep FA 6 only.
- Lazy-load Mapbox GL JS + Leaflet only when the map enters the viewport, via `IntersectionObserver` on `#map` or the strip's mini-map cell.
- Sweep `main.css` for unused selectors (target `≤ 50 KB / ≤ 2 000 lines`). Document removals in `docs/CSS_OPTIMIZATION.md`.

**Acceptance:**
- Exactly 1 Pico stylesheet in `<head>`.
- Exactly 1 Font Awesome bundle in `<head>`.
- `du -h public/css/main.css` shows ≥ 30% reduction (≤ ~50 KB).
- `mapbox-gl.js` is loaded dynamically (via `import()` or appended `<script>`), not from a static `<script>` tag in `<head>` or end-of-body.
- Lighthouse Performance (mobile) ≥ 90 on the production deploy after merge.

### Phase 7 — Accessibility pass + final Lighthouse + after-screenshots
**Files:** `public/index.html`, `public/css/main.css`, `public/js/tabs-accordion.js`
**Changes:**
- Add visible skip link as first focusable element: `<a href="#main" class="skip-link">Skip to main content</a>`.
- Audit colour contrast on `.amber`, `.lime`, `.blue`, `.red` headers; ensure WCAG AA (4.5:1 text or 3:1 large). Specifically `--ui-amber #fbb034` on white likely fails — switch to dark text on amber.
- Tablist keyboard: arrow keys move focus between tabs (roving tabindex), Enter / Space activates, Home / End jump first/last. Implement in `tabs-accordion.js`.
- Status-strip cells: `role="group"`, individual `aria-label`, `tabindex="0"`, focus ring matching site palette.
- Remove the legacy ID alias shim from Phase 3.
- Capture after-screenshots: `docs/current_state/images/ui-redesign-YYYYMMDD-{360,768,1280,1920}.png`.
- Re-run Lighthouse; record in [ui-baseline.md §6](ui-baseline.md#6-to-be-filled-by-worker-agent-phase-0-follow-up) under a new "After" column.

**Acceptance:**
- axe-core: 0 serious/critical violations.
- Lighthouse: Performance ≥ 90 mobile, Accessibility ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.05.
- Tab navigation usable with keyboard only (no mouse).
- All four contrast checks pass at AA.
- After-screenshots committed and referenced from `master_plan.md`.

---

## 3. Spacing token diff (canonical)

| Token | Current | Future | Δ |
|-------|--------:|-------:|--:|
| `--space-md` | 1 rem | 0.75 rem | −25% |
| `--space-lg` | 1.5 rem | 1 rem | −33% |
| `--space-xl` | 2 rem | 1.5 rem | −25% |
| `--space-xxl` | 3 rem | 2 rem | −33% |
| `--space-xxxl` | 4 rem | 2.5 rem | −37% |
| `--pico-card-padding` | 1.5 rem | 0.75 rem | −50% |
| `--pico-line-height` | 1.6 | 1.5 | −6% |

## 4. Type token diff (canonical)

| Token | Current | Future | Notes |
|-------|--------:|-------:|-------|
| `--font-size-h1` | 3 rem | 2.25 rem | hero only |
| `--font-size-h2` | 2.25 rem | 1.5 rem | section titles |
| `--font-size-h3` | 1.5 rem | 1.125 rem | card titles |
| `--font-size-h4` | 1.25 rem | 1 rem | + `font-weight: 600` |
| body | 1 rem | 1 rem | unchanged |
| line-height | 1.6 | 1.5 | density |

## 5. Hero CTA reduction

| Element | Before | After |
|---------|--------|-------|
| Logo | ✔ | ✔ |
| H1 | ✔ | ✔ |
| Tagline | ✔ | ✔ |
| Primary CTA "Get Fire Updates" | ✔ | ✔ |
| RFS Website button | hero | utility bar |
| Permits button | hero | utility bar |
| Donate button | hero | utility bar |
| Contact button | hero | utility bar |
| Facebook icon | hero | utility bar |
| Instagram icon | hero | utility bar |
| Bounce indicator `::after` | always animating | removed (or JS-gated) |

## 6. Emergency-surface consolidation map

| Old surface | Old IDs | New home | Disposition |
|-------------|---------|----------|-------------|
| Header status bar | `statusBarDangerLevel`, `statusBarIncidentCount` | Strip cells 1 + 2 | Removed in Phase 3; IDs aliased through Phase 6 |
| Emergency dashboard overlay | `dashboardDangerLevel`, `dashboardIncidentCount`, `dashboardDangerMessage` | Strip cells 1 + 2 (no overlay needed) | Removed in Phase 3; IDs aliased through Phase 6 |
| Mobile emergency panel + badge | `mobileDangerLevel`, `mobileIncidentBadge`, `mobileIncidentsList` | Strip cells 1 + 2 (responsive) + modal triggered by cell 2 click | Removed in Phase 3; IDs aliased through Phase 6 |
| Fire Info card | `fireDangerRatingCell`, `fireDangerMessage`, `incidentTotalCount`, `incidentCountCell`, `incidentCountLabel`, `fireInfoMapContainer`, `map` | Strip cells 1, 2, 5 + canonical map in Fire Info tab | Card removed; IDs canonical on strip; map element re-parented to tab on expand |

---

## 7. Acceptance — programme-wide (matches issue #56)

- [ ] Home page above-the-fold (1280×800) shows nav + hero (single primary CTA) + full live status strip with no scrolling.
- [ ] No content topic appears twice on the home page.
- [ ] Total page height @ 1280 px reduced by ≥ 35% vs baseline.
- [ ] `public/css/main.css` size reduced by ≥ 30%.
- [ ] Lighthouse Performance ≥ 90 mobile · Accessibility ≥ 95.
- [ ] After-screenshots @ 360 / 768 / 1280 / 1920 saved to `docs/current_state/images/ui-redesign-YYYYMMDD-*.png`.
- [ ] `master_plan.md` reflects all phase statuses.
- [ ] `.github/copilot-instructions.md` updated with new spacing + type scale (after Phase 4 lands).
