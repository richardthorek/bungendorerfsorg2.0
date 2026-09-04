# Infrastructure as Code (IaC)

`main.bicep` provisions the **Static Web App shell**, plus an **Application
Insights** resource (`<staticWebAppName>-insights`, backed by a
`<staticWebAppName>-logs` Log Analytics workspace) for the SWA's managed
API functions. Name, region, SKU, staging-environment policy,
`allowConfigFileUpdates` are all shell-level.

## Application settings are NOT in the Bicep

The `Microsoft.Web/staticSites/config` resource does a **full replace** of the
app-settings collection. This app's settings have grown feature by feature
(members' auth, ACS email, Azure OpenAI, Microsoft Clarity, the duty line, live
fire feeds) and are set directly on the Static Web App with
`az staticwebapp appsettings set` (or the portal). Managing a partial set from
IaC would wipe the rest and break auth, Social Studio, the brigade phone, and
contact email.

The authoritative, complete settings list — with dev values and comments — is
[`../api/local.settings.example.json`](../api/local.settings.example.json), and
the per-feature breakdown is in
[`../docs/API_INTEGRATION.md`](../docs/API_INTEGRATION.md#environment-variables).

```bash
# set / update one setting
az staticwebapp appsettings set \
  --name bungendorerfs-static --resource-group BungendoreRFS \
  --setting-names "AZURE_OPENAI_API_KEY=<value>"

# list current settings (values are redacted in the CLI output)
az staticwebapp appsettings list --name bungendorerfs-static --resource-group BungendoreRFS
```

## Deploy the shell

```bash
az account set --subscription "<subscription-name-or-id>"
az group create --name BungendoreRFS --location eastasia
cp infra/parameters.example.json infra/parameters.json    # edit if needed
az deployment group create \
  --resource-group BungendoreRFS \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json
```

## Wire up Application Insights

The bicep deploy provisions the App Insights resource but does **not** connect
it — that's an app setting, and app settings are managed out-of-band for the
same full-replace reason as everything else above. After deploying (or
re-deploying) the shell:

```bash
CONN=$(az deployment group show -g BungendoreRFS -n main \
  --query properties.outputs.appInsightsConnectionString.value -o tsv)
az staticwebapp appsettings set \
  --name bungendorerfs-static --resource-group BungendoreRFS \
  --setting-names "APPLICATIONINSIGHTS_CONNECTION_STRING=$CONN"
```

The managed Functions runtime picks this up automatically — no code changes
needed in `api/`. See
[`../docs/API_INTEGRATION.md`](../docs/API_INTEGRATION.md#azure-application-insights)
for how to query it from the CLI (the `application-insights` extension fails
to install in some environments — `az rest` against the REST API is the
fallback used there).

## App + API code deployment

Code deploys via GitHub Actions
(`.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml`), triggered
on `workflow_run` after CI passes. It publishes the frontend and the HTTP-trigger
Functions together as one package:

- `app_location: ./public`
- `api_location: ./api`
