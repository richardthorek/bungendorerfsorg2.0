# CSS Optimization Guide

## Overview

This document describes the CSS optimization changes made to improve maintainability, reduce complexity, and eliminate redundancy in the Bungendore RFS website styles.

## Phase 6 Dead-CSS Removal (April 2026)

As part of Phase 6 (Asset dedupe and performance cleanup), the following dead CSS blocks were removed. Each block was confirmed unused by cross-checking against `public/index.html`, all files under `public/js/`, and `public/Content/`.

### Blocks removed

| Block | What it styled | Approx. lines |
|-------|---------------|--------------|
| Old emergency overlay (`.emergency-status-bar`, `.emergency-dashboard`, `.mobile-emergency-*`, etc.) | Replaced by the Phase 3 Live Status Strip | ~340 |
| Old fire-danger level colour-coding (`.danger-level-display[data-level=*]`, `.fire-danger-panel[data-level=*]`, `.mobile-danger-level[data-level=*]`, `@keyframes pulse`) | Dashboard overlay elements no longer in the DOM | ~95 |
| Old responsive show/hide for emergency components (`@media (min-width: 769px)` / `@media (max-width: 768px)` blocks) | Same as above | ~25 |
| `#fireInfoSummaryCard.status-panel` and its sub-rules | Card removed in Phase 3 | ~30 |
| Dark-mode overrides for `#fireInfoSummaryCard` (`fire-messages-banner`, `fire-info-panel`, etc.) | Card removed in Phase 3 | ~40 |
| `.fire-info-grid-enhanced`, `.fire-info-panel`, `.fire-danger-panel .panel-content`, `.incident-map-panel .panel-content` | Card removed in Phase 3 | ~60 |
| `#fireInfoSummaryCard #map` | Replaced by `.fire-info-map` layout | ~5 |
| `.incident-summary`, `.fire-info-panel .data-value`, `.fire-info-actions`, `.quick-action-btn` | Card removed in Phase 3 | ~110 |
| Responsive rules for the above in `@media (max-width: 768px)` and `@media (max-width: 480px)` | Dead responsive code | ~80 |
| `#fireInfoSummaryCard .learn-more-link`, `@media (min-width: 600px) .fire-info-grid` | Card removed; grid class unused | ~25 |
| `#fireInfoSummaryCard .two-column-grid / .data-point / .data-value / .data-label small` | Card removed in Phase 3 | ~35 |
| `.two-column-grid`, `.data-point`, `.data-value` (global) | Not present in HTML or JS | ~30 |
| `article.summaryCard > header.*` variants (deduplicated into `article > header.*`) | `.summaryCard` class never applied | ~35 |
| `.summaryCard` standalone rules (standalone block + selector in accordion) | Class never applied | ~10 |
| `.header-container`, `.button-container` (and their responsive rules) | Not present in HTML or JS | ~15 |
| `.prepare-section`, `.incidents-section`, `.info-section`, `.membership-section`, `.events-section` | Section classes not in HTML | ~30 |
| `.feature-card.compact .cardIcon` (removed from grouped icon selector) | Class not in HTML | ~1 |
| `.dashboard-action-btn::after`, `.mobile-action-btn::after`, `.quick-action-btn::after` (removed from `a::after` group) | Classes removed | ~3 |
| `.learn-more-link` (global, and `#fireInfoSummaryCard .learn-more-link:focus`) | Class not in HTML or JS | ~30 |
| `@media (max-width: 1500px) .summary-grid, #pageFoot .container.grid` | Neither selector matches the DOM | ~6 |
| `.nav-logo` in `@media (max-width: 500px)` | Element uses id `navLogo`, not this class | ~3 |
| Dead CSS custom properties: `--prepare-bg-light`, `--info-bg-light`, `--membership-bg-light`, `--events-bg-light`, `--prepare-bg`, `--info-bg`, `--membership-bg`, `--events-bg` | Variables declared but never referenced | ~8 |
| Leaflet marker/control CSS (`.leaflet-marker-icon`, `.leaflet-control`) | Leaflet removed from the project | ~9 |

### File size impact

| Metric | Before | After |
|--------|--------|-------|
| File size | ~78.6 KB | ~54.3 KB |
| Reduction | – | **30.9 %** |

---

## CSS Structure

### File Organization

The main CSS file (`/public/css/main.css`) is organized into logical sections:

1. **CSS Variables** – Root variables for colors, spacing, fonts; dark mode overrides
2. **General Styles** – Body, HTML, and base element styling
3. **Typography** – Header styles (h1–h6), text hierarchy
4. **Component Styling** – Section headers, cards, navigation, footer, interactive elements, map, live-status strip, tabs/accordion

### CSS Variables

#### Color System

```css
/* NSW RFS Brand Colors */
--rfs-core-red: #e5281b;
--rfs-lime: #cbdb2a;
--rfs-dark-grey: #4d4d4f;
--rfs-light-grey: #bcbec0;
--rfs-black: #000000;
--rfs-white: #ffffff;

/* Semantic UI Colors */
--ui-amber: #fbb034; /* Watch & Act */
--ui-blue: #215e9e; /* Advice */
--ui-green: #008550; /* General positive actions */
```

#### Spacing System

```css
--space-xs: 0.25rem;
--space-sm: 0.5rem;
--space-md: 1rem;
--space-lg: 1.5rem;
--space-xl: 2rem;
--space-xxl: 3rem;
```

#### Component Variables

```css
--pico-card-background-color: var(--rfs-white);
--pico-card-border-color: var(--rfs-light-grey);
--pico-card-padding: var(--space-lg);
--pico-border-radius: 8px;
```

## Best Practices

### 1. CSS Variable Usage

- Use semantic variables (`--ui-amber`) over direct colors
- Leverage spacing variables (`--space-lg`) for consistency
- Maintain dark mode overrides in dedicated sections

### 2. Selector Organization

- Group related selectors together
- Use shared base styles with specific overrides
- Avoid deep nesting and overly specific selectors

### 3. `!important` Usage

- Use sparingly and only when necessary
- Prefer specificity over `!important` when possible

## Maintenance Guidelines

### Removing Styles

1. Verify styles are not used in HTML/JS/Content before removing
2. Check for dependencies in other CSS rules
3. Update this document when removing significant sections

This optimization approach ensures the CSS remains maintainable while supporting the existing design system and functionality.

