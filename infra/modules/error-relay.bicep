// ============================================================================
// Solo error-monitoring relay: App Insights exception -> Azure Monitor alert
// -> Action Group -> Logic App -> deduped GitHub issue in THIS repo.
// ----------------------------------------------------------------------------
// One app, its own alert + relay — see docs/wiki/developer/error-pipeline-blueprint.md
// ("Solo — one app, its own everything") in richardthorek/Station-Manager for
// the full portable spec this is adapted from. That repo also runs a "Suite"
// variant sharing one relay across several apps; this module deliberately
// does NOT do that — bungendorerfs-static-insights is this app's own
// resource, not shared, so there's no roleRepoMap/multi-repo dispatch here.
//
// Deliberately NOT wired into main.bicep — this has its own release cadence
// (deploy by hand, see infra/README.md "Error relay" section) and touches
// alerting/relay infra, not per-app hosting.
//
// Secure parameters (githubToken, appInsightsApiKey) must be supplied at
// deploy time — never commit them to a parameters file.
// ============================================================================

@description('Resource ID of this app\'s Application Insights resource (bungendorerfs-static-insights).')
param appInsightsResourceId string

@description('Application Insights "Application ID" (App ID, not instrumentation key) — from the resource\'s API Access blade. Used to build the Query API URL.')
param appInsightsAppId string

@description('Read-only Application Insights API key (API Access blade -> Create API Key, read telemetry).')
@secure()
param appInsightsApiKey string

@description('GitHub PAT (fine-grained, Issues: read/write) scoped to just this repo.')
@secure()
param githubToken string

@description('The GitHub repo that owns every exception from this App Insights resource.')
param targetRepo object = { owner: 'richardthorek', repo: 'bungendorerfsorg2.0' }

@description('Base name for the alert/action-group/logic-app resource set.')
param namePrefix string = 'bungendorerfs-error-relay'

@description('Azure region.')
param location string = resourceGroup().location

@description('How often the query is evaluated (ISO 8601 duration).')
param evaluationFrequency string = 'PT5M'

@description('Lookback window for each evaluation (ISO 8601 duration).')
param windowSize string = 'PT5M'

@description('Alert severity (0 = critical .. 4 = verbose).')
param severity int = 2

@description('Tags applied to every resource.')
param tags object = {
  application: 'bungendorerfs-static'
  component: 'error-relay'
}

// ----------------------------------------------------------------------------
// Logic App (Consumption) — the relay itself.
// ----------------------------------------------------------------------------
// Trigger: HTTP request from the Action Group (Common Alert Schema v2).
// Flow:
//   1. Bail out (no-op, 200) unless essentials.monitorCondition == 'Fired' —
//      a Scheduled Query Rule also fires a 'Resolved' notification once the
//      window stops matching, carrying the same last-observed data; without
//      this gate that Resolved echo posts a spurious duplicate comment.
//   2. Pull problemId out of the alert's split-by dimensions.
//   3. Query the App Insights Query API for the matching exception's detail
//      (type, message, method, operation name, custom properties, stack).
//   4. Search GitHub for an open `[auto:<problemId>]` issue in targetRepo.
//      Comment "fired again" if found; otherwise create it with the
//      `auto-filed` label.
// Newline handling: every interpolated App Insights text field is passed
// through replace(..., '\n', decodeUriComponent('%0A')) before going into the
// issue/comment body — App Insights returns literal two-character `\n`
// sequences in these fields, not real newlines.
resource logicApp 'Microsoft.Logic/workflows@2019-05-01' = {
  name: namePrefix
  location: location
  tags: tags
  properties: {
    state: 'Enabled'
    parameters: {
      appInsightsAppId: { value: appInsightsAppId }
      appInsightsApiKey: { value: appInsightsApiKey }
      githubToken: { value: githubToken }
      targetRepo: { value: targetRepo }
    }
    definition: {
      '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
      contentVersion: '1.0.0.0'
      parameters: {
        appInsightsAppId: { type: 'string' }
        appInsightsApiKey: { type: 'securestring' }
        githubToken: { type: 'securestring' }
        targetRepo: { type: 'object' }
      }
      triggers: {
        manual: {
          type: 'Request'
          kind: 'Http'
          inputs: {
            schema: {}
          }
        }
      }
      actions: {
        Check_Fired: {
          type: 'If'
          expression: {
            equals: [
              '@triggerBody()?[\'data\']?[\'essentials\']?[\'monitorCondition\']'
              'Fired'
            ]
          }
          actions: {
            Parse_Dimensions: {
              type: 'Compose'
              inputs: '@triggerBody()?[\'data\']?[\'alertContext\']?[\'condition\']?[\'allOf\']?[0]?[\'dimensions\']'
              runAfter: {}
            }
            Init_ProblemId: {
              type: 'Compose'
              inputs: '@first(filter(outputs(\'Parse_Dimensions\'), item => equals(item[\'name\'], \'problemId\')))[\'value\']'
              runAfter: { Parse_Dimensions: [ 'Succeeded' ] }
            }
            Query_App_Insights: {
              type: 'Http'
              inputs: {
                method: 'GET'
                uri: '@{concat(\'https://api.applicationinsights.io/v1/apps/\', parameters(\'appInsightsAppId\'), \'/query\')}'
                headers: {
                  'x-api-key': '@{parameters(\'appInsightsApiKey\')}'
                }
                queries: {
                  // KQL string literals need a literal ' character around each
                  // interpolated value; WDL's own string-literal syntax escapes
                  // an embedded ' by doubling it (''), and each of those raw '
                  // characters then needs Bicep's own \' escape to appear in this
                  // source string — hence the \'\'\' runs below (Bicep-escaped
                  // WDL-doubled quote + WDL string close/reopen).
                  query: '@{concat(\'exceptions | where timestamp > ago(1h) | where problemId == \'\'\', outputs(\'Init_ProblemId\'), \'\'\' | order by timestamp desc | take 1 | project timestamp, problemId, operation_Name, outerMessage=details[0].outerMessage, innermostMessage=details[0].innermostMessage, method=details[0].parsedStack[0].method, customDimensions, details=tostring(details)\')}'
                }
              }
              runAfter: { Init_ProblemId: [ 'Succeeded' ] }
            }
            Search_Existing_Issue: {
              type: 'Http'
              inputs: {
                method: 'GET'
                uri: '@{concat(\'https://api.github.com/search/issues?q=repo:\', parameters(\'targetRepo\')[\'owner\'], \'/\', parameters(\'targetRepo\')[\'repo\'], \'+in:title+is:issue+is:open+\', encodeUriComponent(concat(\'[auto:\', outputs(\'Init_ProblemId\'), \']\')))}'
                headers: {
                  Authorization: '@{concat(\'Bearer \', parameters(\'githubToken\'))}'
                  Accept: 'application/vnd.github+json'
                  'User-Agent': 'bungendorerfs-error-relay'
                }
              }
              runAfter: { Query_App_Insights: [ 'Succeeded' ] }
            }
            Has_Existing_Issue: {
              type: 'If'
              expression: {
                greater: [
                  '@body(\'Search_Existing_Issue\')?[\'total_count\']'
                  0
                ]
              }
              runAfter: { Search_Existing_Issue: [ 'Succeeded' ] }
              actions: {
                Comment_On_Existing: {
                  type: 'Http'
                  inputs: {
                    method: 'POST'
                    uri: '@{concat(\'https://api.github.com/repos/\', parameters(\'targetRepo\')[\'owner\'], \'/\', parameters(\'targetRepo\')[\'repo\'], \'/issues/\', string(body(\'Search_Existing_Issue\')?[\'items\'][0][\'number\']), \'/comments\')}'
                    headers: {
                      Authorization: '@{concat(\'Bearer \', parameters(\'githubToken\'))}'
                      Accept: 'application/vnd.github+json'
                      'User-Agent': 'bungendorerfs-error-relay'
                    }
                    body: {
                      body: '@{concat(\'Fired again at \', body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][0], \'.\n\n\', replace(string(body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][7]), \'\\n\', decodeUriComponent(\'%0A\')))}'
                    }
                  }
                }
              }
              else: {
                actions: {
                  Create_New_Issue: {
                    type: 'Http'
                    inputs: {
                      method: 'POST'
                      uri: '@{concat(\'https://api.github.com/repos/\', parameters(\'targetRepo\')[\'owner\'], \'/\', parameters(\'targetRepo\')[\'repo\'], \'/issues\')}'
                      headers: {
                        Authorization: '@{concat(\'Bearer \', parameters(\'githubToken\'))}'
                        Accept: 'application/vnd.github+json'
                        'User-Agent': 'bungendorerfs-error-relay'
                      }
                      body: {
                        title: '@{concat(\'[auto:\', outputs(\'Init_ProblemId\'), \'] \', body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][2])}'
                        labels: [ 'auto-filed' ]
                        body: '@{concat(\'**Operation:** \', body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][2], \'\n**First seen:** \', body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][0], \'\n\n### Message\n\', replace(string(body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][3]), \'\\n\', decodeUriComponent(\'%0A\')), \'\n\n### Stack / details\n```\n\', replace(string(body(\'Query_App_Insights\')?[\'tables\'][0][\'rows\'][0][7]), \'\\n\', decodeUriComponent(\'%0A\')), \'\n```\')}'
                      }
                    }
                  }
                }
              }
            }
          }
          else: {
            actions: {}
          }
          runAfter: {}
        }
      }
      outputs: {}
    }
  }
}

// ----------------------------------------------------------------------------
// Action Group — fan-out target for the alert; invokes the Logic App's HTTP
// trigger callback URL.
// ----------------------------------------------------------------------------
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${namePrefix}-ag'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'errrelay'
    enabled: true
    logicAppReceivers: [
      {
        name: 'errorRelayLogicApp'
        resourceId: logicApp.id
        callbackUrl: listCallbackUrl('${logicApp.id}/triggers/manual', '2019-05-01').value
        useCommonAlertSchema: true
      }
    ]
  }
}

// ----------------------------------------------------------------------------
// Scheduled Query Rule — evaluates every window against this app's own App
// Insights resource, split by problemId so each distinct exception fires its
// own alert instance / GitHub issue.
// ----------------------------------------------------------------------------
resource alertRule 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${namePrefix}-exceptions-alert'
  location: location
  tags: tags
  properties: {
    displayName: 'Production exceptions (bungendorerfs-static)'
    description: 'Fires per distinct problemId when an exception is tracked in bungendorerfs-static-insights. Relayed to GitHub by ${namePrefix}.'
    severity: severity
    enabled: true
    evaluationFrequency: evaluationFrequency
    windowSize: windowSize
    scopes: [ appInsightsResourceId ]
    autoMitigate: true
    criteria: {
      allOf: [
        {
          query: 'exceptions | where timestamp > ago(5m) | summarize count() by problemId'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          dimensions: [
            { name: 'problemId', operator: 'Include', values: [ '*' ] }
          ]
        }
      ]
    }
    actions: {
      actionGroups: [ actionGroup.id ]
    }
  }
}

output logicAppName string = logicApp.name
output actionGroupName string = actionGroup.name
output alertRuleName string = alertRule.name
