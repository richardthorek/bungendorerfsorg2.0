# Bungendore Volunteer Rural Fire Brigade Website

## Overview

This project is a website for the Bungendore Volunteer Rural Fire Brigade. It provides information about fire preparation, fire information, membership, and events. The website includes interactive features such as a map with markers indicating fire warnings, a contact form, and a calendar of community events.

## Features

- **Responsive Design**: Works well on various screen sizes
- **Interactive Map**: Displays real-time fire incidents with markers and alerts
- **Dynamic Content**: Updates based on bushfire danger period and current conditions
- **Dark Mode Support**: Supports user's `prefers-color-scheme` setting
- **Contact Form**: Secure form with spam prevention and comprehensive validation
- **Events Calendar**: Displays upcoming training and community events
- **Optimized Assets**: Consolidated and optimized image assets and CSS
- **Security**: Server-side proxies, XSS protection, input validation, and spam prevention

## Technologies Used

- **HTML5**: Semantic structure with accessibility features
- **CSS3**: Modern styling with CSS variables and responsive design
- **JavaScript (ES6+)**: Interactive features and API integrations
- **Express.js**: Node.js web server with API proxy endpoints
- **Leaflet**: Interactive map with Mapbox tiles
- **Azure Logic Apps**: Backend workflow integration
- **DOMPurify**: XSS protection for dynamic content
- **Luxon**: Timezone-aware date handling
- **Marked**: Markdown parsing for dynamic content

## Project Structure

```
/
├── public/
│   ├── Images/           # All website images and icons
│   ├── css/
│   │   └── main.css      # Main stylesheet (optimized)
│   ├── js/               # JavaScript files
│   │   ├── main.js           # Main logic and fire danger
│   │   ├── map.js            # Interactive map
│   │   ├── contact.js        # Contact form
│   │   ├── calendar.js       # Events calendar
│   │   ├── error-handler.js  # Error handling utilities
│   │   ├── modal-utils.js    # Shared modal functions
│   │   └── dynamicContent.js # Dynamic content loading
│   ├── Content/          # Markdown content files
│   └── index.html        # Main HTML file
├── Documentation/        # Project documentation
│   ├── API_INTEGRATION.md    # API and integration guide
│   ├── TESTING.md            # Testing guide and best practices
│   ├── ASSET_ORGANIZATION.md # Asset structure
│   ├── CSS_OPTIMIZATION.md   # CSS architecture
│   └── CODEBASE_REVIEW.md    # Technical review
├── __tests__/           # Jest unit tests
├── .github/workflows/   # CI/CD workflows
├── server.js            # Express server with API proxies
├── replace-token.js     # Build-time token replacement
├── jest.config.js       # Jest configuration
├── .eslintrc.json       # ESLint configuration
├── .prettierrc.json     # Prettier configuration
└── package.json         # Dependencies and scripts
```

## Installation and Setup

### Prerequisites
- Node.js >= 18.0.0
- npm (comes with Node.js)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/richardthorek/bungendorerfsorg2.0.git
   cd bungendorerfsorg2.0
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and add your credentials (see Environment Configuration below)
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

5. **Open in browser**: Navigate to `http://localhost:3000`

### Environment Configuration

Create a `.env` file in the root directory (see `.env.example` for template):

```bash
# Mapbox Configuration
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here

# Azure Logic Apps Webhook URLs
AZURE_CONTACT_WEBHOOK_URL=https://prod-...
AZURE_CALENDAR_WEBHOOK_URL=https://prod-...
AZURE_INCIDENTS_WEBHOOK_URL=https://prod-...
AZURE_FIRE_DANGER_WEBHOOK_URL=https://prod-...

# Server Configuration
PORT=3000
```

**Important:** Never commit the `.env` file to version control. It contains sensitive credentials.

## Development

### Available Scripts

```bash
# Start development server
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Testing

The project uses Jest for testing:
- **Unit Tests**: Test individual functions and utilities
- **Integration Tests**: Test API endpoints and data flows (planned)
- **Current Coverage**: 29 tests passing, 92%+ coverage on utilities

Run tests with:
```bash
npm test
```

See `Documentation/TESTING.md` for detailed testing guide.

### Code Quality

- **ESLint**: JavaScript linting with recommended rules
- **Prettier**: Code formatting for consistent style
- **CI/CD**: Automated testing and linting on every push/PR

## Features in Detail

### Bushfire Danger Period Indicator

Displays whether the current date is within the bushfire danger period (October to March) and shows required actions for conducting burns.

### Interactive Map

- Real-time fire incidents from NSW RFS
- Filtered by local council areas (Queanbeyan-Palerang, ACT)
- Color-coded markers by alert level:
  - 🔴 Emergency Warning
  - 🟠 Watch and Act
  - 🟡 Advice
  - ⚪ Other/Not Applicable
- Popup details for each incident
- Station marker for Bungendore RFS

### Contact Form

- Comprehensive client and server-side validation
- Australian phone number format support
- Honeypot spam prevention
- Real-time validation feedback
- Secure submission via server proxy

### Events Calendar

- Displays upcoming training events
- Shows community engagement events
- Timezone-aware date/time handling
- Modal details for each event

### Fire Danger Rating

- Displays current danger level for Southern Ranges district
- Color-coded by severity
- Fire behavior message
- Key safety message

## Security Features

### Implemented Security Measures

- ✅ **XSS Protection**: All dynamic content sanitized with DOMPurify
- ✅ **Input Validation**: Client and server-side form validation
- ✅ **Spam Prevention**: Honeypot field in contact form
- ✅ **API Security**: Server-side proxy endpoints hide credentials
- ✅ **Origin Validation**: Mapbox token endpoint validates origin
- ✅ **Environment Variables**: All secrets in .env file
- ✅ **No Vulnerabilities**: npm audit shows 0 vulnerabilities

### Security Best Practices

1. Never commit `.env` file or secrets
2. Rotate API credentials if exposed
3. Run `npm audit` regularly
4. Keep dependencies updated
5. Review server logs for suspicious activity

See `Documentation/API_INTEGRATION.md` for security details.

## API Integrations

The website integrates with:

- **Azure Logic Apps**: Backend workflows for forms and data
- **NSW RFS Fire Danger API**: Real-time fire danger ratings
- **NSW RFS Incidents Feed**: Current fire incidents (GeoJSON)
- **Mapbox**: Map tiles for day/night mode
- **Microsoft Graph API**: Calendar events (via Azure Logic Apps)

All API calls go through server-side proxy endpoints for security.

See `Documentation/API_INTEGRATION.md` for complete API documentation.

## Dark Mode Support

Automatically switches based on user's system preference:
- Logo: `logo.png` ↔ `logo-dark.png`
- Map tiles: Day mode ↔ Night mode
- CSS variables: Light theme ↔ Dark theme

## Recent Improvements (2026)

### Security Fixes ✅
- Removed token logging from server
- Added XSS protection with DOMPurify sanitization
- Moved Azure Logic Apps URLs to backend proxy
- Added origin validation to token endpoint
- Implemented honeypot spam prevention

### Error Handling & Validation ✅
- User-visible error messages for all API failures
- Shared error handler utility
- Comprehensive form validation (client & server)
- Loading states for async operations

### Testing & CI/CD ✅
- Jest testing framework with 29 passing tests
- ESLint and Prettier for code quality
- Automated CI/CD with GitHub Actions
- Security auditing in CI pipeline

### Documentation ✅
- API Integration guide (10KB)
- Testing guide (11KB)
- Environment configuration examples

### Asset & CSS Optimization (2024)
- Removed 45 duplicate/unused images
- Reduced CSS by 37 lines
- Consolidated favicon files
- Improved .gitignore

## CI/CD Pipeline

Automated workflows run on every push and PR:
- ✅ ESLint code linting
- ✅ Prettier formatting checks
- ✅ Jest test suite (29 tests)
- ✅ Test coverage reporting
- ✅ Security audit (npm audit)
- ✅ Dependency checks

See `.github/workflows/ci.yml` for configuration.

## Contributing and Development Process

### Branch Strategy
- **main**: Protected branch, production deployment
- **liveDev**: Integration branch with staging URL
- **Feature branches**: Individual features/fixes with PR to liveDev

### Development Workflow
1. Create feature branch from `liveDev`
2. Develop and test locally
3. Run tests and linting: `npm test && npm run lint`
4. Create PR to `liveDev`
5. After review and testing on liveDev URL, owner merges to `main`

### Code Review Requirements
- All tests passing
- No ESLint errors
- No security vulnerabilities
- Documentation updated if needed

## Documentation

Additional documentation in `/Documentation/`:
- **API_INTEGRATION.md** - Complete API integration guide
- **TESTING.md** - Testing guide and best practices
- **ASSET_ORGANIZATION.md** - Image and icon asset guide
- **CSS_OPTIMIZATION.md** - CSS architecture details
- **CODEBASE_REVIEW.md** - Technical review and recommendations
- **REVIEW_SUMMARY.md** - Executive summary of codebase review

## Troubleshooting

### Common Issues

**Server won't start:**
- Check `.env` file exists and has all required variables
- Verify Node.js version >= 18.0.0: `node --version`
- Try: `rm -rf node_modules && npm install`

**Map not loading:**
- Verify `MAPBOX_ACCESS_TOKEN` in `.env`
- Check browser console for errors
- Verify token hasn't been revoked in Mapbox account

**Form submission fails:**
- Check `AZURE_CONTACT_WEBHOOK_URL` in `.env`
- Verify Azure Logic App is running
- Check server logs for errors

**Tests failing:**
- Clear Jest cache: `npm test -- --clearCache`
- Reinstall dependencies: `rm -rf node_modules && npm install`

See `Documentation/API_INTEGRATION.md` for more troubleshooting.

## Performance

### Optimizations Applied
- Consolidated image assets
- Optimized CSS (reduced file size)
- Server-side caching for static assets
- Efficient API proxy endpoints

### Future Improvements
- Image lazy loading
- Service worker for offline capability
- Further CSS optimization
- Lighthouse score optimization (target: 80+)

## Accessibility

### Current Features
- Semantic HTML5 elements
- ARIA labels and roles
- Keyboard navigation support
- Screen reader compatible
- Form validation feedback

### Future Improvements
- Full accessibility audit
- Enhanced keyboard navigation
- Additional ARIA attributes
- Alt text review

## License

This project is for the Bungendore Volunteer Rural Fire Brigade community use.

## Contact

For issues or questions:
- Open a GitHub issue
- Contact repository owner: @richardthorek

---

**Last Updated:** February 2026  
**Version:** 1.0  
**Maintained By:** Bungendore RFS Development Team

