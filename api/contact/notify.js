/**
 * Contact-form notifications via Azure Communication Services (ACS) Email.
 *
 * Shared by the Azure Function (`api/contact/index.js`) and the local dev
 * server (`server.js`) so both backends send identical mail. No SharePoint,
 * no Teams, no Logic App — the app emails the committee distribution list
 * directly and sends the enquirer a confirmation.
 *
 * Configuration (server-side only — never exposed to the client):
 *   ACS_CONNECTION_STRING  connection string for the ACS resource
 *   ACS_SENDER_ADDRESS     verified MailFrom address, e.g.
 *                          "contact@notify.bungendorerfs.org"
 *   CONTACT_NOTIFY_TO      committee recipient(s); comma-separated for several
 *   CONTACT_NOTIFY_CONFIRM optional "true"/"false" (default true) — send the
 *                          enquirer an acknowledgement email
 */

const { EmailClient } = require("@azure/communication-email");

const SOURCE_URL = "https://www.bungendorerfs.org";

/** Escape a string for safe interpolation into HTML. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Read and validate configuration from an env-like object. */
function readConfig(env) {
  const connectionString = env.ACS_CONNECTION_STRING;
  const senderAddress = env.ACS_SENDER_ADDRESS;
  const notifyTo = (env.CONTACT_NOTIFY_TO || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const sendConfirmation = String(env.CONTACT_NOTIFY_CONFIRM ?? "true").toLowerCase() !== "false";

  const missing = [];
  if (!connectionString) missing.push("ACS_CONNECTION_STRING");
  if (!senderAddress) missing.push("ACS_SENDER_ADDRESS");
  if (notifyTo.length === 0) missing.push("CONTACT_NOTIFY_TO");

  return { connectionString, senderAddress, notifyTo, sendConfirmation, missing };
}

/** Australian Eastern time, formatted for humans. */
function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
}

/**
 * Build the committee notification message.
 * @param {{name:string,email:string,phone:string,message:string}} data
 */
function buildNotification(data, receivedAt) {
  const rows = [
    ["Name", data.name],
    ["Email", data.email],
    ["Phone", data.phone || "—"],
    ["Received", receivedAt],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top">${escapeHtml(
          label,
        )}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const messageHtml = escapeHtml(data.message).replace(/\r?\n/g, "<br>");

  const html = `<!doctype html><html><body style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5">
<h2 style="margin:0 0 4px">New website enquiry</h2>
<p style="margin:0 0 16px;color:#555">Submitted via ${escapeHtml(SOURCE_URL)}</p>
<table style="border-collapse:collapse;margin-bottom:16px">${rows}</table>
<div style="border-left:3px solid #c8102e;padding:8px 0 8px 12px;background:#faf7f7">${messageHtml}</div>
<p style="margin:16px 0 0;color:#777;font-size:12px">Reply directly to this email to respond to ${escapeHtml(
    data.name,
  )}.</p>
</body></html>`;

  const plainText = [
    "New website enquiry",
    `Submitted via ${SOURCE_URL}`,
    "",
    `Name:     ${data.name}`,
    `Email:    ${data.email}`,
    `Phone:    ${data.phone || "—"}`,
    `Received: ${receivedAt}`,
    "",
    data.message,
    "",
    `Reply directly to this email to respond to ${data.name}.`,
  ].join("\n");

  return {
    subject: `Website enquiry from ${data.name}`,
    html,
    plainText,
  };
}

/** Build the acknowledgement sent back to the enquirer. */
function buildConfirmation(data) {
  const html = `<!doctype html><html><body style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5">
<p>Thanks ${escapeHtml(data.name.split(/\s+/)[0] || data.name)},</p>
<p>We've received your enquiry and one of our team will get back to you. We're all
volunteers, so this might take a few days — thank you for your patience.</p>
<p><strong>If this enquiry is about an unattended fire, please call 000.</strong></p>
<p>For reference, this is what you sent us:</p>
<div style="border-left:3px solid #c8102e;padding:8px 0 8px 12px;background:#faf7f7">${escapeHtml(
    data.message,
  ).replace(/\r?\n/g, "<br>")}</div>
<p style="color:#777;font-size:12px">We only use your contact details for this enquiry.
This mailbox is not monitored for replies — we'll be in touch from a brigade address.</p>
</body></html>`;

  const plainText = [
    `Thanks ${data.name.split(/\s+/)[0] || data.name},`,
    "",
    "We've received your enquiry and one of our team will get back to you. We're all",
    "volunteers, so this might take a few days - thank you for your patience.",
    "",
    "If this enquiry is about an unattended fire, please call 000.",
    "",
    "For reference, this is what you sent us:",
    "",
    data.message,
    "",
    "We only use your contact details for this enquiry. This mailbox is not monitored",
    "for replies - we'll be in touch from a brigade address.",
  ].join("\n");

  return {
    subject: "We've received your enquiry — Bungendore RFS",
    html,
    plainText,
  };
}

/**
 * Send the committee notification (required) and enquirer confirmation
 * (best-effort). Throws if configuration is missing or the committee
 * notification fails; a failed confirmation is logged and swallowed.
 *
 * @param {{name:string,email:string,phone:string,message:string}} data
 * @param {object} [options]
 * @param {object} [options.env]     env-like config source (default process.env)
 * @param {object} [options.logger]  object with .log/.warn/.error (default console)
 * @param {Function} [options.clientFactory] (connStr) => EmailClient, for tests
 */
async function sendContactNotifications(data, options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const config = readConfig(env);

  if (config.missing.length > 0) {
    throw new Error(`Email notifications not configured: missing ${config.missing.join(", ")}`);
  }

  const client = options.clientFactory
    ? options.clientFactory(config.connectionString)
    : new EmailClient(config.connectionString);

  const receivedAt = formatTimestamp();
  const notification = buildNotification(data, receivedAt);

  const notifyMessage = {
    senderAddress: config.senderAddress,
    content: {
      subject: notification.subject,
      plainText: notification.plainText,
      html: notification.html,
    },
    recipients: {
      to: config.notifyTo.map((address) => ({ address })),
    },
    replyTo: [{ address: data.email, displayName: data.name }],
  };

  const poller = await client.beginSend(notifyMessage);
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") {
    throw new Error(`Committee notification send finished with status ${result.status}`);
  }
  logger.log(`Contact notification sent (id ${result.id})`);

  if (config.sendConfirmation) {
    try {
      const confirmation = buildConfirmation(data);
      const confirmPoller = await client.beginSend({
        senderAddress: config.senderAddress,
        content: {
          subject: confirmation.subject,
          plainText: confirmation.plainText,
          html: confirmation.html,
        },
        recipients: { to: [{ address: data.email, displayName: data.name }] },
        replyTo: [{ address: config.notifyTo[0] }],
      });
      await confirmPoller.pollUntilDone();
    } catch (error) {
      logger.warn(`Contact confirmation email failed (non-fatal): ${error.message}`);
    }
  }

  return { id: result.id };
}

module.exports = {
  escapeHtml,
  readConfig,
  formatTimestamp,
  buildNotification,
  buildConfirmation,
  sendContactNotifications,
};
