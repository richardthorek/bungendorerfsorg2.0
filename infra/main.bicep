@description('Name of the Azure Static Web App')
param staticWebAppName string = 'bungendorerfs-static'

@description('Azure region for the Static Web App')
param location string = 'eastasia'

@allowed([
  'Free'
  'Standard'
])
@description('SWA SKU')
param skuName string = 'Free'

@secure()
@description('Mapbox public access token used by /mapbox-token')
param mapboxAccessToken string

@secure()
@description('Webhook URL for contact form submissions')
param azureContactWebhookUrl string

@secure()
@description('Webhook URL for calendar events')
param azureCalendarWebhookUrl string

@secure()
@description('Webhook URL for incidents GeoJSON')
param azureIncidentsWebhookUrl string

@secure()
@description('Webhook URL for fire danger XML feed')
param azureFireDangerWebhookUrl string

@description('Optional comma-separated origin allow-list for mapbox token endpoint')
param allowedOrigins string = ''

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: skuName
    tier: skuName
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

resource staticSiteAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  name: '${staticSite.name}/appsettings'
  properties: {
    MAPBOX_ACCESS_TOKEN: mapboxAccessToken
    AZURE_CONTACT_WEBHOOK_URL: azureContactWebhookUrl
    AZURE_CALENDAR_WEBHOOK_URL: azureCalendarWebhookUrl
    AZURE_INCIDENTS_WEBHOOK_URL: azureIncidentsWebhookUrl
    AZURE_FIRE_DANGER_WEBHOOK_URL: azureFireDangerWebhookUrl
    ALLOWED_ORIGINS: allowedOrigins
  }
}

output staticWebAppId string = staticSite.id
output staticWebAppHostname string = staticSite.properties.defaultHostname
