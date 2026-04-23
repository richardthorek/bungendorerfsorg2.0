# Asset Organization and Usage Guide

## Overview

This document describes the current asset organization for the Bungendore Rural Fire Brigade website, including image/icon locations, usage patterns, and maintenance guidelines.

## Current Asset Structure

### Root Directory Assets

The following favicon and PWA assets are located in the root directory:

- `android-chrome-192x192.png` - Android Chrome favicon (192x192)
- `android-chrome-512x512.png` - Android Chrome favicon (512x512)
- `apple-touch-icon.png` - Apple touch icon for iOS
- `favicon-16x16.png` - Standard favicon (16x16)
- `favicon-32x32.png` - Standard favicon (32x32)
- `favicon.ico` - Main favicon file
- `mstile-150x150.png` - Microsoft tile icon
- `safari-pinned-tab.svg` - Safari pinned tab icon
- `site.webmanifest` - PWA manifest file
- `browserconfig.xml` - Microsoft browser configuration

### Public Images Directory (`/public/Images/`)

Main images used throughout the site:

#### Logos

- `logo.png` - Main logo (light background)
- `logo-dark.png` - Dark mode logo (dark background)

#### Hero Images

Each hero is provided at two responsive breakpoints in WebP (preferred) and JPEG (fallback) formats.

- `hero4-desktop.webp` / `hero4-desktop.jpg` - Light mode hero, desktop (1600×900)
- `hero4-mobile.webp` / `hero4-mobile.jpg` - Light mode hero, mobile (768×500)
- `hero1-desktop.webp` - Dark mode hero, desktop (1600×900)
- `hero1-mobile.webp` - Dark mode hero, mobile (768×432)
- `hero1.jpg` - Dark mode hero, JPEG fallback (original)

#### Alert/Status Icons

- `advice.png` - Advice level fire alert icon
- `watch-and-act.png` - Watch and Act fire alert icon
- `emergency-warning.png` - Emergency Warning fire alert icon
- `other.png` - Other/default fire alert icon

#### Content Images

- `prepare.jpeg` - Prepare for bushfires section image
- `communityEvent.jpeg` - Community events section image
- `linkPreview.png` - Social media link preview image

#### Footer Icons

- `station.png` - Station location icon
- `mail.png` - Mail/postal icon
- `firefighter.png` - Firefighter icon

## Asset Usage Patterns

### CSS References

Images are referenced in CSS using relative paths:

```css
--hero-bg: image-set(
  url("/Images/hero4-desktop.webp") type("image/webp"),
  url("/Images/hero4-desktop.jpg") type("image/jpeg")
);
--rfs-logo: url("/Images/logo-dark.png");
```

### HTML References

Images are referenced in HTML using root-relative paths:

```html
<img src="/Images/logo.png" alt="Bungendore Rural Fire Brigade Logo" id="navLogo" />
<img src="/Images/prepare.jpeg" alt="Prepare for Bushfires" class="parallax-image" />
```

### JavaScript References

Alert icons are dynamically loaded in JavaScript:

```javascript
function getIconUrl(category) {
  switch (category) {
    case "Advice":
      return "/Images/advice.png";
    case "Watch and Act":
      return "/Images/watch-and-act.png";
    case "Emergency Warning":
      return "/Images/emergency-warning.png";
    default:
      return "/Images/other.png";
  }
}
```

## Maintenance Guidelines

### Adding New Images

1. Place images in the appropriate subdirectory of `/public/Images/`
2. Use descriptive filenames with appropriate extensions
3. Update this documentation with new asset descriptions
4. Ensure consistent naming patterns (lowercase, hyphens for spaces)

### Optimizing Images

- Use WebP format for better compression when browser support allows
- Maintain multiple sizes for responsive design
- Consider lazy loading for large images
- Optimize file sizes for web delivery

### Favicon Management

- Keep all favicon files in the root directory
- Update all favicon sizes when changing the logo
- Test favicon appearance across different browsers and devices
- Use favicon generation tools for consistency

### Best Practices

1. **Consistency**: Use consistent naming conventions
2. **Organization**: Group related images in logical subdirectories
3. **Optimization**: Compress images for web delivery
4. **Accessibility**: Always provide meaningful alt text
5. **Maintenance**: Regular audit of unused images

## Image Specifications

### Logo Images

- Format: PNG with transparency
- Light logo: Use on light backgrounds
- Dark logo: Use on dark backgrounds or in dark mode

### Hero Images

- Format: WebP (primary) with JPEG fallback
- Desktop: 1600×900px; mobile: 768×(430–500)px
- CSS `image-set()` selects WebP where supported; `@media (max-width: 768px)` selects the mobile asset
- Preloaded via `<link rel="preload">` in `index.html` for LCP improvement
- To replace the hero: generate both desktop and mobile variants in WebP + JPEG and update the `--hero-bg` CSS variable

### Icons

- Format: PNG with transparency preferred
- Size: 24x24 to 128x128 pixels depending on usage
- Style: Consistent with RFS branding guidelines

### Favicons

- Multiple sizes: 16x16, 32x32, 192x192, 512x512
- Format: PNG for most, ICO for legacy support
- Background: Transparent where possible

## Recent Changes (2024)

### Asset Consolidation

- Removed duplicate favicon files from `/public/` directory
- Removed unused RFS-Icons-PNGs folder (38 unused icons)
- Cleaned up macOS system artifacts (.DS_Store, \_\_MACOSX folders)
- Updated .gitignore to prevent future system artifacts

### File Reduction

- Removed 45 duplicate and unused image files
- Consolidated asset references for better maintenance
- Improved folder structure clarity

This consolidation reduced project size and eliminated confusion about which assets were canonical.
