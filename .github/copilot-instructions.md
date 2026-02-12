# GitHub Copilot Instructions

This document serves as the single source of truth for development workflows, conventions, and standards for the Bungendore RFS Website 2.0 repository.

---

## Table of Contents
- [Planning and Documentation](#planning-and-documentation)
- [Branching Strategy and Review Policy](#branching-strategy-and-review-policy)
- [Build, Test, and CI/CD](#build-test-and-cicd)
- [Coding Conventions and Standards](#coding-conventions-and-standards)
- [Repository-Specific Quirks](#repository-specific-quirks)
- [Security Considerations](#security-considerations)
- [Contact and Ownership](#contact-and-ownership)

---

## Planning and Documentation

### Documentation Structure
This repository uses the following documentation structure:

- **README.md** (root): Main project overview, setup instructions, and contribution guidelines
- **Documentation/** directory: Technical documentation and code reviews
  - `REVIEW_SUMMARY.md`: Executive summary of codebase review with action items
  - `CODEBASE_REVIEW.md`: Detailed technical analysis and recommendations
  - `QUICK_FIXES.md`: Step-by-step implementation checklist
  - `ASSET_ORGANIZATION.md`: Complete guide to image and icon assets
  - `CSS_OPTIMIZATION.md`: CSS architecture and optimization details

### Current State Documentation
- **Current state documentation** is maintained in `Documentation/REVIEW_SUMMARY.md` and `CODEBASE_REVIEW.md`
- **Status updates** should be tracked in these files when implementing fixes or improvements
- **Screenshots and images** related to documentation are stored in relevant documentation files or in `public/Images/` for website assets

### Planning Documents
**Note:** This repository does not currently have a `master_plan.md` or dedicated `/planning/` directory. Project planning and status tracking are done through:
- GitHub Issues for task tracking
- Pull Requests for feature implementation
- Documentation files in `/Documentation/` for architectural decisions and reviews

### When Making Changes
- Update relevant documentation files when architectural changes are made
- Reference related GitHub issues in commit messages and PRs
- Update the README.md if setup instructions or dependencies change
- Keep Documentation/ files current with code changes

---

## Branching Strategy and Review Policy

### Branch Structure
- **main**: Production branch - protected, requires PR approval
  - Merged into from `liveDev` branch by repository owner
  - Deploys automatically to production via Azure Static Web Apps
  
- **liveDev**: Integration/staging branch
  - Combined feature testing branch
  - Has a permanent URL for verification before production
  - Features merge here first for testing
  
- **Feature branches**: Individual issue/feature development
  - Should be created from `liveDev`
  - Naming convention: `copilot/<descriptive-name>` or `feature/<descriptive-name>`
  - Should have a PR to merge into `liveDev` when ready

### Pull Request Policy
1. **Create PR to `liveDev` first** for all features and fixes
2. Test thoroughly on the `liveDev` deployment URL
3. After verification, repository owner merges `liveDev` → `main`
4. PRs should reference the related GitHub issue (e.g., "Fixes #123")
5. Include clear description of changes and testing performed

### Code Review Requirements
- All PRs require review before merging to `liveDev`
- Owner approval required for merging `liveDev` → `main`
- Security-related changes require extra scrutiny
- Breaking changes must be clearly documented

---

## Build, Test, and CI/CD

### Local Development
```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm start
# This runs: node replace-token.js && node server.js
```

### Build Process
- No explicit build step currently
- `replace-token.js` runs before server start (via `prestart` script)
- Handles token replacement in JavaScript files at runtime
- **Note:** This approach is flagged for refactoring to build-time process in CODEBASE_REVIEW.md

### Testing
⚠️ **Current State:** No test infrastructure exists yet
- Zero test coverage currently (see CODEBASE_REVIEW.md Issue #8)
- Testing improvements are planned in Phase 3 of the technical roadmap
- When adding features, manual testing is required

### CI/CD Pipeline
**Current Setup:**
- Azure Static Web Apps deployment workflow at `.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml`
- Triggers on push to `main` and `liveDev` branches
- Triggers on PRs to `main`
- Automatically deploys to Azure Static Web Apps

**What's Missing (see CODEBASE_REVIEW.md Issue #10):**
- No automated testing in CI
- No linting checks on PRs
- No security scanning
- Planned improvements in Phase 3

### Environment Variables Required
Create a `.env` file in the root directory with:
```
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

**Note:** No `.env.example` currently exists - this is noted as a gap in CODEBASE_REVIEW.md

---

## Coding Conventions and Standards

### JavaScript Conventions
- **ES6+ syntax** used throughout
- **No module bundler**: Plain JavaScript loaded via script tags
- **DOMPurify** used for XSS sanitization (must be applied to all innerHTML)
- **Fetch API** for all HTTP requests
- **Error handling**: Log to console and provide user feedback (being improved)

### CSS Architecture
Follows component-based organization with:
- **CSS Variables** for theming (`--rfs-primary`, `--rfs-accent-green`, etc.)
- **Utility classes** for common patterns
- **Dark mode support** via CSS custom properties and `prefers-color-scheme`
- **Responsive design** using mobile-first approach
- See `Documentation/CSS_OPTIMIZATION.md` for detailed guidelines

### HTML/Accessibility
- Use semantic HTML5 elements
- Include proper ARIA labels where needed
- Ensure all images have appropriate alt text
- Support keyboard navigation
- Test with screen readers when possible

### File Organization
```
/
├── .github/
│   ├── workflows/           # CI/CD workflows
│   └── copilot-instructions.md  # This file
├── Documentation/           # Technical docs and reviews
├── public/                  # Static website files
│   ├── Content/            # Markdown content files
│   ├── Images/             # All images and icons
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript files
│   └── index.html          # Main HTML file
├── server.js               # Express server
├── replace-token.js        # Token replacement utility
└── package.json            # Dependencies and scripts
```

### Dependencies
- Keep dependencies minimal and up-to-date
- Run `npm audit` regularly for security vulnerabilities
- Document any new dependencies in PR description
- **Note:** Several dependencies are outdated (see CODEBASE_REVIEW.md Issue #7)

---

## Repository-Specific Quirks

### Token Replacement at Runtime
⚠️ **Quirk:** The `replace-token.js` script runs as a `prestart` hook and modifies `main.js` at runtime
- Replaces `MAP_TOKEN_PLACEHOLDER` with actual Mapbox token
- This should ideally be a build-time operation (not runtime)
- **Issue #3 in CODEBASE_REVIEW.md:** Token is currently logged to console (security risk)

### Azure Logic Apps Integration
- Contact form, calendar, and map features use Azure Logic Apps webhooks
- ⚠️ **CRITICAL:** Webhook URLs with signatures are currently hardcoded in frontend JavaScript
  - This is Issue #1 (CRITICAL) in CODEBASE_REVIEW.md
  - Must be moved to server-side proxy endpoints
  - **Action required before new features**

### Mapbox Token Endpoint
- Server exposes `/mapbox-token` endpoint
- ⚠️ **HIGH RISK:** No origin validation or rate limiting
- See Issue #4 in CODEBASE_REVIEW.md

### Favicon Files
- Favicon files are in root directory (not in public/)
- This is intentional for proper browser discovery
- See `Documentation/ASSET_ORGANIZATION.md` for details

### Dark Mode
- Uses CSS `prefers-color-scheme` media query
- Logo swaps between `logo.png` and `logo-dark.png`
- CSS variables automatically adjust

---

## Security Considerations

⚠️ **CRITICAL SECURITY ISSUES IDENTIFIED** - See `Documentation/REVIEW_SUMMARY.md`

### Immediate Security Actions Required
Before adding new features, address these critical issues:

1. **Remove Token Logging** (Issue #3)
   - Remove all console logging of tokens in `replace-token.js`
   - Rotate Mapbox token after fix

2. **Secure Azure Logic Apps URLs** (Issue #1)
   - Regenerate all Azure Logic Apps signatures
   - Move URLs to `.env` file
   - Create server-side proxy endpoints
   - Remove hardcoded URLs from client JavaScript

3. **Fix XSS Vulnerabilities** (Issue #2)
   - Apply `DOMPurify.sanitize()` to ALL innerHTML assignments
   - Especially in `main.js`, `dynamicContent.js`, `map.js`

4. **Secure Token Endpoint** (Issue #4)
   - Add origin validation to `/mapbox-token`
   - Implement rate limiting

### Security Best Practices
- Never commit secrets to version control
- Use `.env` for all sensitive configuration
- Sanitize all user inputs and API responses
- Validate all form inputs (client and server-side)
- Keep dependencies updated
- Run `npm audit` regularly

### Security Review Checklist
When making changes:
- [ ] No secrets in code or commits
- [ ] All innerHTML uses DOMPurify.sanitize()
- [ ] Form inputs are validated
- [ ] Error messages don't expose sensitive information
- [ ] API endpoints have appropriate access controls
- [ ] New dependencies are audited for vulnerabilities

---

## Contact and Ownership

### Repository Owner
- **Owner:** richardthorek (GitHub: @richardthorek)
- **Organization:** Bungendore Volunteer Rural Fire Brigade

### Getting Help
1. **For code issues:** Open a GitHub issue
2. **For security concerns:** Contact repository owner directly
3. **For documentation questions:** Refer to files in `/Documentation/`

### Contributing
This is a community project for the Bungendore Volunteer Rural Fire Brigade. Contributions should:
- Follow the conventions outlined in this document
- Address items from the codebase review when possible
- Improve security, accessibility, and user experience
- Be tested on the `liveDev` environment before production

---

## Additional Resources

### Internal Documentation
- [README.md](../README.md) - Project overview and setup
- [Documentation/REVIEW_SUMMARY.md](../Documentation/REVIEW_SUMMARY.md) - Action items and priorities
- [Documentation/CODEBASE_REVIEW.md](../Documentation/CODEBASE_REVIEW.md) - Detailed technical analysis
- [Documentation/QUICK_FIXES.md](../Documentation/QUICK_FIXES.md) - Step-by-step fix checklist
- [Documentation/ASSET_ORGANIZATION.md](../Documentation/ASSET_ORGANIZATION.md) - Asset management guide
- [Documentation/CSS_OPTIMIZATION.md](../Documentation/CSS_OPTIMIZATION.md) - CSS architecture

### External References
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Top 10 Web Security Risks](https://owasp.org/www-project-top-ten/)
- [DOMPurify XSS Sanitization](https://github.com/cure53/DOMPurify)
- [Leaflet Documentation](https://leafletjs.com/)

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Next Review:** After Phase 1 Security Fixes (see REVIEW_SUMMARY.md)
