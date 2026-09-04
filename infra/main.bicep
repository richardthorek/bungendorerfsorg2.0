// Provisions the Static Web App shell plus its Application Insights resource.
//
// Application settings are NOT managed here. The `Microsoft.Web/staticSites/config`
// resource does a full replace of the app-settings collection, and this app's
// settings have grown per-feature (members' auth, ACS, Azure OpenAI, Clarity,
// duty line, …) and are set out-of-band with `az staticwebapp appsettings set`.
// Running a partial settings block from IaC would wipe the rest and break auth,
// Social Studio, the brigade phone, and contact email. See infra/README.md and
// api/local.settings.example.json for the full settings surface — including the
// APPLICATIONINSIGHTS_CONNECTION_STRING setting that wires the SWA's managed
// Functions to the `appInsights` resource below (also done out-of-band, for the
// same full-replace reason).

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

@description('Azure region for Application Insights + its Log Analytics workspace')
param appInsightsLocation string = 'australiaeast'

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

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${staticWebAppName}-logs'
  location: appInsightsLocation
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${staticWebAppName}-insights'
  location: appInsightsLocation
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Bluefield'
    IngestionMode: 'LogAnalytics'
    WorkspaceResourceId: logAnalytics.id
  }
}

output staticWebAppId string = staticSite.id
output staticWebAppHostname string = staticSite.properties.defaultHostname
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsName string = appInsights.name
