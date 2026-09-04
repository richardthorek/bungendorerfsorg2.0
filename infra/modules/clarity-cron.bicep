// ============================================================================
// Scheduled Clarity pull: a Logic App Recurrence trigger POSTs to
// /api/clarity/cron a few times a day, so the Analytics tab's snapshot stays
// fresh without depending on a member signing in (the prior behaviour —
// maybeRefreshClarity() piggybacking on /api/auth/me — still runs too, as a
// fallback, but the cron is now the primary source).
//
// Deliberately NOT wired into main.bicep — same reasoning as
// infra/modules/error-relay.bicep: separate release cadence, owner-deployed
// by hand. See infra/README.md "Scheduled Clarity pull".
//
// Secure parameter (cronSecret) must be supplied at deploy time — never
// commit it to a parameters file. The same value must also be set as the
// CLARITY_CRON_SECRET app setting on the Static Web App, or every call 401s
// (api/shared/handlers.js's handleClarityCron rejects unconditionally while
// that setting is unset).
// ============================================================================

@description('Base URL of the deployed site (no trailing slash).')
param siteUrl string = 'https://bungendorerfs.org'

@description('Shared secret sent as the X-Cron-Secret header — must match the CLARITY_CRON_SECRET app setting.')
@secure()
param cronSecret string

@description('Base name for the Logic App resource.')
param name string = 'bungendorerfs-clarity-cron'

@description('Azure region.')
param location string = resourceGroup().location

@description('How often to pull, in hours. Every 6h = 4x/day, well under the 9/day Clarity budget (clarityInsights.js MAX_FETCHES_PER_DAY), leaving headroom for opportunistic/manual refreshes.')
param intervalHours int = 6

@description('Tags applied to the resource.')
param tags object = {
  application: 'bungendorerfs-static'
  component: 'clarity-cron'
}

resource logicApp 'Microsoft.Logic/workflows@2019-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    state: 'Enabled'
    parameters: {
      siteUrl: { value: siteUrl }
      cronSecret: { value: cronSecret }
    }
    definition: {
      '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
      contentVersion: '1.0.0.0'
      parameters: {
        siteUrl: { type: 'string' }
        cronSecret: { type: 'securestring' }
      }
      triggers: {
        Recurrence: {
          type: 'Recurrence'
          recurrence: {
            frequency: 'Hour'
            interval: intervalHours
          }
        }
      }
      actions: {
        Call_Clarity_Cron: {
          type: 'Http'
          inputs: {
            method: 'POST'
            uri: '@{concat(parameters(\'siteUrl\'), \'/api/clarity/cron\')}'
            headers: {
              'X-Cron-Secret': '@{parameters(\'cronSecret\')}'
            }
          }
          runAfter: {}
        }
      }
      outputs: {}
    }
  }
}

output logicAppName string = logicApp.name
