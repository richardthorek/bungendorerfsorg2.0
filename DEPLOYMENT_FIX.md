# Fix for Dynamic Site Elements Not Loading

## Issue Summary

The website's dynamic elements (map, incidents list, fire danger rating) were failing to load with errors:
- "Unable to Load Map"
- "Could not load fire danger information"
- "No active incidents in our area" (when there should be incidents)

## Root Cause

The Azure Static Web Apps deployment was configured to redirect all API calls (`/api/*` and `/mapbox-token`) to an external API server at `https://api.bungendorerfs.org` that either doesn't exist or isn't properly configured.

## Solution Implemented

### 1. Created Azure Functions API Backend

Created a new `/api` folder with Azure Functions that replicate all the Express.js server endpoints:

- **mapbox-token** - Returns Mapbox access token with origin validation
- **fire-danger** - Proxies fire danger rating data from Azure Logic Apps
- **fire-incidents** - Proxies fire incidents data for the map from Azure Logic Apps
- **calendar-events** - Proxies calendar events from Azure Logic Apps
- **contact** - Handles contact form submissions with validation and spam prevention

All functions include:
- Proper CORS headers
- Error handling
- Input validation (where applicable)
- Security measures (origin validation, honeypot spam check)

### 2. Updated Configuration Files

- **public/staticwebapp.config.json**: Removed external API redirects so API calls route to the local Azure Functions
- **.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml**: Updated to deploy the `/api` folder alongside static files

### 3. Added Documentation

- **api/README.md**: Complete guide for Azure Functions setup, local development, and troubleshooting
- **api/.gitignore**: Prevents committing local settings and build artifacts

## Required Actions to Complete the Fix

### ⚠️ CRITICAL: Configure Environment Variables in Azure

The Azure Functions need environment variables to work. These **must** be configured in the Azure Portal:

1. Go to your Azure Static Web Apps resource in Azure Portal
2. Navigate to **Configuration** in the left menu
3. Under **Application settings**, add the following:

   ```
   MAPBOX_ACCESS_TOKEN=<your_mapbox_token>
   AZURE_FIRE_DANGER_WEBHOOK_URL=<your_azure_logic_apps_url>
   AZURE_INCIDENTS_WEBHOOK_URL=<your_azure_logic_apps_url>
   AZURE_CALENDAR_WEBHOOK_URL=<your_azure_logic_apps_url>
   AZURE_CONTACT_WEBHOOK_URL=<your_azure_logic_apps_url>
   ```

4. Click **Save** to apply the changes

**Note:** The values for these variables should match what you have in your local `.env` file (if you have one) or in your Express.js server configuration.

### How to Get the Environment Variable Values

If you don't have these values:

1. **MAPBOX_ACCESS_TOKEN**: Get this from your Mapbox account at https://account.mapbox.com/
2. **Azure Logic Apps URLs**: Get these from the Azure Portal:
   - Navigate to your Logic Apps
   - Click on the HTTP trigger
   - Copy the callback URL

### Testing the Fix

Once the environment variables are configured:

1. Wait for the next deployment (or manually trigger one by pushing to `main` or `liveDev` branch)
2. Visit your deployed site
3. Check that:
   - Map loads with markers
   - Fire danger rating displays
   - Incidents list shows current incidents
   - Contact form works
   - Calendar events display

### Verification Checklist

- [ ] Environment variables configured in Azure Portal
- [ ] Deployment successful (check GitHub Actions)
- [ ] Map loads without errors
- [ ] Fire danger rating displays
- [ ] Incidents list populates
- [ ] Contact form submits successfully
- [ ] Calendar events load

## Local Development

The Express.js server (`server.js`) can still be used for local development:

```bash
npm start
```

This will run the Express.js server on `http://localhost:3000` with the same API endpoints.

For local Azure Functions testing:

```bash
cd api
func start
```

This will run the functions on `http://localhost:7071/api/*`

## Architecture Changes

### Before
```
Browser → Azure Static Web Apps → Redirect to https://api.bungendorerfs.org (doesn't exist) → ❌ ERROR
```

### After
```
Browser → Azure Static Web Apps → Azure Functions (deployed with site) → Azure Logic Apps → ✅ SUCCESS
```

## Files Changed

- `.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml` - Updated to deploy API
- `public/staticwebapp.config.json` - Removed external redirects
- `api/` - **NEW** - Complete Azure Functions API backend
  - `host.json` - Azure Functions configuration
  - `package.json` - API dependencies
  - `mapbox-token/` - Mapbox token endpoint
  - `fire-danger/` - Fire danger endpoint
  - `fire-incidents/` - Fire incidents endpoint
  - `calendar-events/` - Calendar events endpoint
  - `contact/` - Contact form endpoint
  - `README.md` - API documentation
  - `.gitignore` - Excludes local settings

## Additional Notes

- All tests pass (29/29)
- No linting errors
- Follows existing code patterns and security practices
- Maintains backward compatibility with Express.js server for local development
- All API functions use the same logic as the Express.js server

## Support

If you encounter issues:

1. Check Azure Static Web Apps deployment logs in GitHub Actions
2. Verify environment variables are set correctly in Azure Portal
3. Check browser console for detailed error messages
4. Review `/api/README.md` for troubleshooting tips

## Summary

This fix converts the site from depending on an external API server to using Azure Functions that deploy alongside the static site. Once the environment variables are configured in Azure Portal, all dynamic site elements should load correctly.
