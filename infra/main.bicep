// Provisions the Static Web App *shell* only.
//
// Application settings are NOT managed here. The `Microsoft.Web/staticSites/config`
// resource does a full replace of the app-settings collection, and this app's
// settings have grown per-feature (members' auth, ACS, Azure OpenAI, Clarity,
// duty line, …) and are set out-of-band with `az staticwebapp appsettings set`.
// Running a partial settings block from IaC would wipe the rest and break auth,
// Social Studio, the brigade phone, and contact email. See infra/README.md and
// api/local.settings.example.json for the full settings surface.

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

output staticWebAppId string = staticSite.id
output staticWebAppHostname string = staticSite.properties.defaultHostname
