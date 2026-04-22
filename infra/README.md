# Infrastructure as Code (IaC)

This folder provisions the production Static Web App and all runtime settings required by the integrated `api/` Functions package.

## What this deploys

- Azure Static Web App (`Microsoft.Web/staticSites`)
- Static Web App app settings used by integrated API functions:
  - `MAPBOX_ACCESS_TOKEN`
  - `AZURE_CONTACT_WEBHOOK_URL`
  - `AZURE_CALENDAR_WEBHOOK_URL`
  - `AZURE_INCIDENTS_WEBHOOK_URL`
  - `AZURE_FIRE_DANGER_WEBHOOK_URL`
  - `ALLOWED_ORIGINS`

## Deploy

```bash
# 1) Choose your subscription
az account set --subscription "<subscription-name-or-id>"

# 2) Create/update the resource group
az group create --name BungendoreRFS --location eastasia

# 3) Copy and edit parameters
cp infra/parameters.example.json infra/parameters.json

# 4) Deploy IaC
az deployment group create \
  --resource-group BungendoreRFS \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json
```

## App code deployment

Infrastructure is created by IaC, but code deployment still happens via GitHub Actions using `.github/workflows/azure-static-web-apps-lively-flower-0577f4700.yml`.

That workflow now includes:

- `app_location: ./public`
- `api_location: ./api`

So the frontend and HTTP-trigger Functions are deployed together as one Static Web App package.
