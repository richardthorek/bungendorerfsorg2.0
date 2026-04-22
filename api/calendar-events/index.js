/**
 * Azure Function: Calendar Events
 * Proxies requests to Azure Logic Apps for calendar events
 */

module.exports = async function (context, _req) {
  try {
    const webhookUrl = process.env.AZURE_CALENDAR_WEBHOOK_URL;

    if (!webhookUrl) {
      context.log.error("AZURE_CALENDAR_WEBHOOK_URL not configured");
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
        body: { error: "Failed to fetch events" },
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
      },
      body: data,
    };
  } catch (error) {
    context.log.error("Error fetching calendar events:", error);
    context.res = {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: "Failed to fetch events" },
    };
  }
};
