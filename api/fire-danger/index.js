/**
 * Azure Function: Fire Danger Rating
 * Proxies requests to Azure Logic Apps for fire danger data
 */

module.exports = async function (context, _req) {
  try {
    const webhookUrl = process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;

    if (!webhookUrl) {
      context.log.error("AZURE_FIRE_DANGER_WEBHOOK_URL not configured");
      context.res = {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
        body: { error: "Server configuration error" },
      };
      return;
    }

    const response = await fetch(webhookUrl);

    if (!response.ok) {
      context.log.error(`Azure webhook returned status ${response.status}`);
      context.res = {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
        },
        body: { error: "Failed to fetch fire danger" },
      };
      return;
    }

    const data = await response.text();

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: data,
    };
  } catch (error) {
    context.log.error("Error fetching fire danger:", error);
    context.res = {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: "Failed to fetch fire danger" },
    };
  }
};
