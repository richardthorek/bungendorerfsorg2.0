# CSS Optimization Guide

## Overview

This document describes the CSS optimization changes made to improve maintainability, reduce complexity, and eliminate redundancy in the Bungendore RFS website styles.

## CSS Structure

### File Organization

The main CSS file (`/public/css/main.css`) is organized into logical sections:

1. **CSS Variables** (lines 1-133)
   - Root variables for colors, spacing, fonts
   - Dark mode variable overrides
   - Semantic color definitions

2. **General Styles** (lines 134-179)
   - Body, HTML, and base element styling
   - Global typography settings

3. **Typography** (lines 180-250)
   - Header styles (h1-h6)
   - Text styling and hierarchy

4. **Component Styling** (lines 251+)
   - Section headers and banners
   - Cards and containers
   - Navigation and footer
   - Interactive elements

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

### Utility Classes

#### Background Color Classes

```css
.bg-rfs-core-red {
  background-color: var(--rfs-core-red);
  color: var(--text-color-light);
}
.bg-rfs-lime {
  background-color: var(--rfs-lime);
  color: var(--text-color-dark);
}
.bg-ui-amber {
  background-color: var(--ui-amber);
  color: var(--text-color-light);
}
.bg-ui-blue {
  background-color: var(--ui-blue);
  color: var(--text-color-light);
}
.bg-ui-green {
  background-color: var(--ui-green);
  color: var(--text-color-light);
}
```

#### Text Color Classes

```css
.whiteText {
  color: var(--text-color-light) !important;
}
```

## Optimizations Made

### 1. Removed Unused CSS Rules

**Files affected**: `/public/css/main.css`

Removed the following unused selectors:

- `.elementToProof` - Not referenced in HTML/JS
- `.invisible-cell` - Not referenced in HTML/JS
- `.icon-category-cell` - Not referenced in HTML/JS
- `.summary-card` - Inconsistent with `.summaryCard` (standardized on `.summaryCard`)

**Impact**: Reduced CSS file size by 28 lines, improved maintainability

### 2. Consolidated Duplicate Styles

**Files affected**: `/public/css/main.css`

#### Header Style Consolidation

**Before**:

```css
article > header.green,
article.summaryCard > header.green {
  padding: var(--space-md);
  margin-bottom: var(--space-lg);
  border-bottom: none;
  border-radius: var(--pico-border-radius) var(--pico-border-radius) 0 0;
  /* ... repeated styles ... */
}
```

**After**:

```css
/* Shared styles for all colored headers */
article > header.red,
article.summaryCard > header.red,
article > header.amber,
article.summaryCard > header.amber,
article > header.blue,
article.summaryCard > header.blue,
article > header.green,
article.summaryCard > header.green {
  /* Common styles */
}

/* Specific styles for green headers only */
article > header.green,
article.summaryCard > header.green {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

#### Dark Mode Consolidation

**Before**:

```css
#fireInfoSummaryCard .fire-messages-banner {
  background-color: var(--rfs-neutral-dark);
  color: var(--text-color-dark);
}
#fireInfoSummaryCard.status-panel .fire-messages-banner {
  background-color: var(--rfs-neutral-dark);
  color: var(--text-color-dark);
}
```

**After**:

```css
#fireInfoSummaryCard .fire-messages-banner,
#fireInfoSummaryCard.status-panel .fire-messages-banner {
  background-color: var(--rfs-neutral-dark);
  color: var(--text-color-dark);
}
```

### 3. Standardized Class Names

**Files affected**: `/public/css/main.css`

- Unified `.summary-card` references to `.summaryCard` for consistency
- Maintained existing HTML class usage patterns
- Improved selector specificity and maintainability

### 4. Optimized !important Usage

**Current Count**: 7 instances (reduced from 10)

Remaining `!important` declarations are justified:

- `padding-block: 0 !important;` - Override Pico CSS defaults
- `color: var(--text-color-light) !important;` - Utility class overrides
- `border: none !important;` - Component-specific overrides
- `display: block/none !important;` - Responsive visibility controls

## Performance Impact

### File Size Reduction

- **Before**: 1629 lines
- **After**: 1592 lines
- **Reduction**: 37 lines (2.3% smaller)

### Maintainability Improvements

- Eliminated duplicate style blocks
- Standardized naming conventions
- Improved CSS selector organization
- Better use of CSS variables for consistency

### No Visual Changes

All optimizations maintain the existing visual design and functionality while improving code quality.

## Best Practices

### 1. CSS Variable Usage

- Use semantic variables (`--ui-amber`) over direct colors
- Leverage spacing variables (`--space-lg`) for consistency
- Maintain dark mode overrides in dedicated sections

### 2. Selector Organization

- Group related selectors together
- Use shared base styles with specific overrides
- Avoid deep nesting and overly specific selectors

### 3. Utility Classes

- Use utility classes for common patterns
- Maintain consistent naming conventions
- Document utility class purposes

### 4. !important Usage

- Use sparingly and only when necessary
- Document the reason for each !important
- Prefer specificity over !important when possible

## Future Optimization Opportunities

1. **Responsive Consolidation**: Group mobile-specific styles together
2. **Component Splitting**: Consider splitting into multiple CSS files by component
3. **Unused Style Audit**: Regular audits of unused styles as HTML changes
4. **CSS Custom Properties**: Expand usage of CSS custom properties for theming

## Maintenance Guidelines

### Adding New Styles

1. Use existing CSS variables where possible
2. Follow established naming conventions
3. Group related styles in logical sections
4. Document any new utility classes

### Removing Styles

1. Verify styles are not used in HTML/JS before removing
2. Check for dependencies in other CSS rules
3. Update this documentation when removing significant sections

### Refactoring

1. Maintain visual consistency during refactoring
2. Test across different browsers and devices
3. Use version control for tracking changes
4. Update documentation with significant changes

This optimization approach ensures the CSS remains maintainable while supporting the existing design system and functionality.
