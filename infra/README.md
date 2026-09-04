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

## Error relay (production exceptions -> GitHub issue -> draft PR)

`infra/modules/error-relay.bicep` provisions a Scheduled Query Rule + Action
Group + Logic App that watches this app's Application Insights resource
(`bungendorerfs-static-insights`, provisioned by `main.bicep` — see the
"Wire up Application Insights" section above; that must exist before this
module deploys) and files a deduped `[auto:<problemId>]` GitHub issue for
every distinct exception. `.github/workflows/auto-diagnose.yml` then picks up
that issue and any labeled `auto-filed`, tries to diagnose and fix it, and
opens a single shared **draft** PR (`auto-fix/queue`) for human review —
never auto-merges. Adapted from the portable spec in
`richardthorek/Station-Manager`'s
`docs/wiki/developer/error-pipeline-blueprint.md` ("Solo" mode — this app's
own alert/relay, not shared with other repos).

Deliberately **not** wired into `main.bicep` or the app-deploy CI pipeline —
it has its own release cadence and touches alerting infra, not per-app
hosting. Deploy by hand:

```bash
# App Insights "Application ID" (not instrumentation key) — Overview blade
APP_ID=$(az resource show --ids <bungendorerfs-static-insights resource ID> --query properties.AppId -o tsv)
APP_INSIGHTS_RESOURCE_ID=$(az resource show --ids <bungendorerfs-static-insights resource ID> --query id -o tsv)

# Generate at portal.azure.com -> the App Insights resource -> API Access ->
# Create API Key, with "Read telemetry" checked. Never commit this value.
read -s -p "App Insights read-only API key: " APP_INSIGHTS_API_KEY; echo

# Fine-grained GitHub PAT scoped to just this repo, Issues: read/write only.
# Never commit this value.
read -s -p "GitHub PAT (Issues: read/write): " GITHUB_TOKEN; echo

az deployment group create \
  --resource-group BungendoreRFS \
  --template-file infra/modules/error-relay.bicep \
  --parameters appInsightsAppId="$APP_ID" \
               appInsightsResourceId="$APP_INSIGHTS_RESOURCE_ID" \
               appInsightsApiKey="$APP_INSIGHTS_API_KEY" \
               githubToken="$GITHUB_TOKEN"
```

Run `az deployment group what-if` with the same parameters before every
re-apply — the three resources already exist by name after the first
deploy, so a plan showing **Create** instead of **Modify** on a re-run means
something drifted; stop and check before it doubles up the pipeline.

**Repo secrets to add** (Settings -> Secrets and variables -> Actions) for
the GitHub Actions half:

| Secret | Required? | Purpose |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes, or `auto-diagnose.yml` skips green with a warning | Generate with `claude setup-token` locally |
| `APP_INSIGHTS_APP_ID` | Optional | Lets the diagnosis step query telemetry itself for wider context. Same value as `APP_ID` above |
| `APP_INSIGHTS_API_KEY` | Optional | Same read-only key generated above (can reuse it) |

After both halves are deployed, trigger one deliberate error end-to-end and
confirm the chain: exception -> alert (~5 min) -> GitHub issue -> `auto-diagnose.yml`
run -> comment or draft PR.
