/**
 * Azure Function: Fire Incidents
 * Proxies requests to Azure Logic Apps for fire incidents data (map markers)
 */

module.exports = async function (context, _req) {
  try {
    const webhookUrl = process.env.AZURE_INCIDENTS_WEBHOOK_URL;

    if (!webhookUrl) {
      context.log.error("AZURE_INCIDENTS_WEBHOOK_URL not configured");
      context.res = {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
        body: { error: "Server configuration error" },
      };
      return;
    }

    const response = await fetch(webhookUrl, {
      method: "GET",
      headers: {
        "X-Request-ID": "Get-Fire-Incidents",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      context.log.error(`Azure webhook returned status ${response.status}`);
      context.res = {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
        },
        body: { error: "Failed to fetch incidents" },
      };
      return;
    }

    const data = await response.json();

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
      },
      body: data,
    };
  } catch (error) {
    context.log.error("Error fetching fire incidents:", error);
    context.res = {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: "Failed to fetch incidents" },
    };
  }
};
