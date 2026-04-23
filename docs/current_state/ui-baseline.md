# UI Baseline — Home Page (Pre-Redesign)

**Captured:** 2026-04-23 · **Source commit:** topic branch `claude/fix-dynamic-site-elements-loading` · **Tracking issue:** [#56](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56)

This is the evidence base for the "Command Centre" UI redesign. Every claim links to a file path and line number so it can be verified or revisited.

---

## 1. Page composition (top → bottom)

| # | Region | Source | Approx. height @ 1280 px |
|---|--------|--------|--------------------------|
| 1 | `<header id="siteHeader">` — nav + emergency status bar + (hidden) emergency dashboard overlay + (hidden) mobile emergency panel | [public/index.html](../../public/index.html#L57-L168) | ~80 px (collapsed); 360 px+ when overlay opens |
| 2 | `.hero` with logo, H1, CTA paragraph, "Get Fire Updates" prominent CTA, 4-button + 2-icon button-container, animated bounce indicator | [public/index.html](../../public/index.html#L172-L223) | 60vh, clamped 500–700 px → ~600 px |
| 3 | Fire Information `summaryCard.status-panel` (full width) — fire-messages banner, fire danger panel, embedded incident map, expand button, incident summary, 2 quick-action buttons | [public/index.html](../../public/index.html#L228-L307) | ~560 px |
| 4 | 3-up `summaryCard` row — Prepare / Membership / Events teasers (each duplicates its tab) | [public/index.html](../../public/index.html#L310-L354) | ~220 px |
| 5 | Tab navigation (4 tabs) | [public/index.html](../../public/index.html#L358-L398) | ~64 px |
| 6 | Active tab panel (Fire Information by default) — full content article with header + dynamic data tables | [public/index.html](../../public/index.html#L401-L427) | ~480 px |
| 7 | (Inactive tab panels — Prepare, Membership, Events — each contains a full `article` with coloured header + grid + content + parallax image) | [public/index.html](../../public/index.html#L430-L529) | rendered but `display:none` |
| 8 | `<footer id="footer">` — `article.grid#pageFoot` of 4 `<article>` cards (Brand+social, Station, Postal, Hours) | [public/index.html](../../public/index.html#L538-L587) | ~280 px |

**Total above-the-fold (header + hero) at 1280×800:** ~680 px → **status data is below the fold**.
**Total page height @ 1280 px (default tab):** ~2 280 px → 2.85 viewport scrolls.

---

## 2. Confirmed findings (from issue #56, validated against source)

### F1. Structural duplication — biggest single issue
The same four topics render twice:
- **Teaser layer** (regions 3 + 4): one full-width Fire Info card + 3-up Prepare/Membership/Events cards.
- **Deep-dive layer** (regions 5 + 6 + 7): tabbed/accordion area with full content for the same four topics.

Visitors scroll the teasers, then scroll **past** them to reach the same topics in the tab panel. The page reads as two homepages stacked.

### F2. Hero occupies the entire first viewport
- `--hero-height: 60vh; --hero-min-height: 500px; --hero-max-height: 700px;` — [public/css/main.css L4–6](../../public/css/main.css#L4-L6).
- `.hero hgroup.heading-background` adds `padding: var(--space-xl)` = 2 rem on top of that.
- Hero stack: 7 em logo → H1 (3 rem) → CTA paragraph (1.5 rem) → prominent CTA → button-container with **4 buttons + 2 social icons** ([L195–219](../../public/index.html#L195-L219)) → animated `::after` bounce indicator.
- A `margin-top: -8rem` on `#fireInfoSummaryCard.status-panel` ([public/css/main.css L489](../../public/css/main.css#L489)) claws the next card back under the hero — a hack signalling the hero is too tall.

### F3. Spacing tokens inflated and applied universally
Tokens ([public/css/main.css L52–59](../../public/css/main.css#L52-L59)):
```
--space-md: 1rem; --space-lg: 1.5rem; --space-xl: 2rem; --space-xxl: 3rem; --space-xxxl: 4rem;
```
Stacked cost between hero bottom and first piece of real content:
- Hero → next container: `margin-top: var(--space-xxl)` = 3 rem
- Card padding: `var(--pico-card-padding)` = 1.5 rem
- Card header padding: `var(--space-md)` = 1 rem
- Card header margin: `var(--space-lg)` = 1.5 rem
**= ~7 rem (112 px) of pure whitespace** before any data is rendered.

### F4. Type scale too large for a data-dense page
```
--font-size-h1: 3rem; --font-size-h2: 2.25rem; --font-size-h3: 1.5rem; --font-size-h4: 1.25rem;
```
Card-title H3 (1.5 rem bold) is larger than the data it introduces.

### F5. Universal hover-lift
`article, .content-section, .summaryCard { ... transform: translateY(-4px) on :hover }` ([public/css/main.css L90–104](../../public/css/main.css#L90-L104)) is global. Footer is built from `<article>`s, so the contact panels also jiggle on hover. Nothing feels stable.

### F6. Asset & dependency bloat
- **Two Pico stylesheets:** [index.html L11](../../public/index.html#L11) (`@picocss/pico@latest`) + [L26](../../public/index.html#L26) (`@picocss/pico@2/css/pico.colors.min.css`). The second one is colours-only and may be intentional, but the version mismatch (`latest` vs `@2`) is fragile.
- **Two Font Awesome bundles:** [L21–22](../../public/index.html#L21-L23) FA 5.15.4 + [L29–30](../../public/index.html#L29-L31) FA 6.0.0-beta3.
- `public/css/main.css` = **72 KB / 2 861 lines**.
- `public/index.html` = **28 KB / 664 lines**.
- 10 separate JS files loaded from `public/js/` ([L654–663](../../public/index.html#L654-L663)).

### F7. Three duplicated emergency surfaces
- Header status bar — `#emergencyStatusBar` ([L68–84](../../public/index.html#L68-L84)) → `#statusBarDangerLevel`, `#statusBarIncidentCount`.
- Header dashboard overlay — `#emergencyDashboard` ([L96–134](../../public/index.html#L96-L134)) → `#dashboardDangerLevel`, `#dashboardIncidentCount`, `#dashboardDangerMessage`.
- Mobile emergency panel — `#mobileEmergencyPanel` ([L136–165](../../public/index.html#L136-L165)) → `#mobileDangerLevel`, `#mobileIncidentBadge`, `#mobileIncidentsList`.
- In-page Fire Info card — `#fireInfoSummaryCard` ([L231–306](../../public/index.html#L231-L306)) → `#fireDangerRatingCell`, `#fireDangerMessage`, `#incidentTotalCount`, `#incidentCountCell`, `#incidentCountLabel`.

Multiple JS files (`emergency-dashboard.js`, `main.js`, `dynamicContent.js`) keep these in sync. High maintenance cost; visual repetition.

### F8. Footer is over-cardified
`#pageFoot` is `article.grid` containing 4 nested `<article>` cards ([L538–587](../../public/index.html#L538-L587)). Each gets full card padding, border, shadow, and the global hover-lift. Simple contact info inflates to ~280 px.

---

## 3. Quantified baseline metrics (deterministic, measured from source)

| Metric | Value | Source |
|--------|------:|--------|
| `public/index.html` size | 28 KB | `du -h` |
| `public/index.html` lines | 664 | `wc -l` |
| `public/css/main.css` size | 72 KB | `du -h` |
| `public/css/main.css` lines | 2 861 | `wc -l` |
| Stylesheets in `<head>` | 7 | grep |
| Pico stylesheet versions loaded | 2 (`latest`, `@2`) | F6 |
| Font Awesome bundles loaded | 2 (`5.15.4`, `6.0.0-beta3`) | F6 |
| JS files loaded (own) | 10 | F6 |
| Emergency-data DOM IDs maintained in parallel | 4 surfaces × 2–3 fields each | F7 |
| `--hero-min-height` | 500 px | F2 |
| `--hero-max-height` | 700 px | F2 |
| Whitespace between hero and first data | ~7 rem (~112 px) | F3 |
| Topics rendered twice on home | 4 (Fire Info, Prepare, Membership, Events) | F1 |

---

## 4. Above-the-fold information density (1280×800, default state)

| Visible content | Status data conveyed |
|-----------------|----------------------|
| Logo, brand name, "Stay Safe. Stay Informed.", 1 prominent CTA, 4 secondary CTAs, 2 social icons, animated bounce indicator | **Zero** |

The hero contains no fire-danger rating, no incident count, no warning level, no total-fire-ban status. The status bar in the header partially mitigates this (shows danger + incident count) but is small (~40 px) and easy to overlook on first paint.

---

## 5. ID inventory — what the new status strip must preserve (or alias)

For Phase 3 (status-strip consolidation) to land without breaking the 10 JS files, these IDs must either continue to exist on the new strip or be aliased via `data-*` attributes that JS is updated to read:

| ID | Currently written by | New location proposed |
|----|---------------------|------------------------|
| `statusBarDangerLevel` | `emergency-dashboard.js`, `main.js` | Strip cell 1 (Fire Danger Rating) |
| `statusBarIncidentCount` | `emergency-dashboard.js` | Strip cell 2 (Active Incidents) |
| `dashboardDangerLevel` | `emergency-dashboard.js` | Removed; alias to strip cell 1 |
| `dashboardDangerMessage` | `emergency-dashboard.js` | Strip cell 1 sub-label |
| `dashboardIncidentCount` | `emergency-dashboard.js` | Removed; alias to strip cell 2 |
| `mobileDangerLevel` | `emergency-dashboard.js` | Removed; alias to strip cell 1 |
| `mobileIncidentBadge` | `emergency-dashboard.js` | Removed (badge not needed when strip is always visible) |
| `mobileIncidentsList` | `emergency-dashboard.js` | Moved into modal opened by strip cell 2 |
| `fireDangerRatingCell` | `dynamicContent.js`, `main.js` | Strip cell 1 (canonical) |
| `fireDangerMessage` | `dynamicContent.js` | Strip cell 1 sub-label |
| `incidentTotalCount` | `map.js`, `dynamicContent.js` | Strip cell 2 (canonical) |
| `incidentCountCell` | `map.js` | Strip cell 2 breakdown |
| `incidentCountLabel` | `map.js` | Strip cell 2 sub-label |
| `fireInfoMapContainer` / `map` | `map.js` | Strip cell 5 (mini-map thumbnail) → expanded view in tab panel |

Strategy: Phase 3 introduces the strip with **all** these IDs present (some on visually-hidden span aliases). Phase 7 removes the aliases once JS is migrated to read from a single canonical set.

---

## 6. To be filled by worker agent (Phase 0 follow-up)

These three sub-tasks need a browser/CI environment that this analysis pass does not have. They are the only Phase 0 items not completed in this PR.

### 6.1 Lighthouse — production home page (https://www.bungendorerfs.org)

| Category | Score | LCP | CLS | TBT |
|----------|------:|----:|----:|----:|
| Performance (mobile) | _TBD_ | _TBD_ s | _TBD_ | _TBD_ ms |
| Performance (desktop) | _TBD_ | _TBD_ s | _TBD_ | _TBD_ ms |
| Accessibility | _TBD_ | — | — | — |
| Best Practices | _TBD_ | — | — | — |
| SEO | _TBD_ | — | — | — |

Targets after Phase 7: Performance ≥ 90 mobile · LCP ≤ 2.5 s · CLS ≤ 0.05 · Accessibility ≥ 95.

### 6.2 Baseline screenshots
Capture the deployed home page (or a local `npm start`) at the four standard breakpoints, save under `docs/current_state/images/`:
- `ui-baseline-YYYYMMDD-360.png`
- `ui-baseline-YYYYMMDD-768.png`
- `ui-baseline-YYYYMMDD-1280.png`
- `ui-baseline-YYYYMMDD-1920.png`

### 6.3 axe-core run
Single axe-core scan on the deployed home page; record violations count by severity. Used to size Phase 7.

---

## 7. How to verify this baseline yourself

```bash
# from repo root
npm install
npm start            # http://localhost:3000
# open the wireframe (no server needed)
xdg-open docs/current_state/wireframe/index.html  # or `open` on macOS
```

The wireframe at [docs/current_state/wireframe/index.html](wireframe/index.html) renders the **current** layout and the **future** layout side-by-side at four breakpoints, with annotations pointing at every finding above. It is a single self-contained HTML file — no build step, no network calls.
