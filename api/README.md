# Azure Functions API

This directory contains Azure Functions that serve as proxy endpoints for the Bungendore RFS website when deployed to Azure Static Web Apps.

## Structure

Each function is in its own directory:

- `mapbox-token/` - Returns the Mapbox access token with origin validation
- `fire-danger/` - Proxies fire danger rating data from Azure Logic Apps
- `fire-incidents/` - Proxies fire incidents data (map markers) from Azure Logic Apps
- `calendar-events/` - Proxies calendar events from Azure Logic Apps
- `contact/` - Handles contact form submissions with validation and spam prevention

## Environment Variables

The following environment variables must be configured in Azure Static Web Apps settings:

- `MAPBOX_ACCESS_TOKEN` - Mapbox API token for map tiles
- `AZURE_FIRE_DANGER_WEBHOOK_URL` - Azure Logic Apps webhook for fire danger data
- `AZURE_INCIDENTS_WEBHOOK_URL` - Azure Logic Apps webhook for fire incidents
- `AZURE_CALENDAR_WEBHOOK_URL` - Azure Logic Apps webhook for calendar events
- `AZURE_CONTACT_WEBHOOK_URL` - Azure Logic Apps webhook for contact form

## Configuration in Azure Portal

1. Go to your Azure Static Web Apps resource
2. Navigate to **Configuration** in the left menu
3. Under **Application settings**, add each environment variable
4. Click **Save** to apply changes

## Local Development

To test these functions locally:

1. Install Azure Functions Core Tools:
   ```bash
   npm install -g azure-functions-core-tools@4
   ```

2. Create a `local.settings.json` file in the `/api` directory:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "MAPBOX_ACCESS_TOKEN": "your_token_here",
       "AZURE_FIRE_DANGER_WEBHOOK_URL": "your_url_here",
       "AZURE_INCIDENTS_WEBHOOK_URL": "your_url_here",
       "AZURE_CALENDAR_WEBHOOK_URL": "your_url_here",
       "AZURE_CONTACT_WEBHOOK_URL": "your_url_here"
     }
   }
   ```

3. Start the functions:
   ```bash
   cd api
   func start
   ```

4. Functions will be available at:
   - `http://localhost:7071/api/mapbox-token`
   - `http://localhost:7071/api/fire-danger`
   - `http://localhost:7071/api/fire-incidents`
   - `http://localhost:7071/api/calendar-events`
   - `http://localhost:7071/api/contact`

## Deployment

These functions are automatically deployed with the Azure Static Web Apps deployment workflow. The workflow is configured to:

1. Deploy static files from `/public` folder
2. Deploy API functions from `/api` folder
3. Configure routing to use the local API functions instead of external redirects

See `.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml` for deployment configuration.

## Security

- All functions validate origins and include CORS headers
- Contact form includes honeypot spam prevention and comprehensive validation
- Mapbox token is validated against allowed origins
- All webhook URLs are stored as environment variables (never in code)

## Troubleshooting

**Functions not loading on deployed site:**
1. Verify environment variables are set in Azure Static Web Apps configuration
2. Check deployment logs in GitHub Actions
3. Check Azure Static Web Apps logs in Azure Portal

**Local functions not working:**
1. Ensure `local.settings.json` exists with all required environment variables
2. Verify Azure Functions Core Tools are installed
3. Check function logs in terminal for errors

## Migration from Express.js

These Azure Functions replace the Express.js server (`server.js`) for the deployed Azure Static Web Apps environment. The Express.js server can still be used for local development by running `npm start` from the root directory.
