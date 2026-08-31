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
const LOGO_URL = `${SOURCE_URL}/Images/logo.png`; // white RFS wordmark, reads on the red band
const BRIGADE_NAME = "Bungendore Volunteer Rural Fire Brigade";

// Palette lifted from the live site (main.css :root — NSW RFS brand + "Clear Skies")
const C = {
  red: "#e5281b",
  darkGrey: "#4d4d4f",
  ink: "#2b2b2b",
  secondary: "#6b6b6b",
  muted: "#9a9a9a",
  hairline: "#ece9e4",
  cardFill: "#f6f5f2",
  pageBg: "#f4f4f4",
  link: "#215e9e",
  calloutBg: "#fff4e0",
  calloutFg: "#8a6d00",
  white: "#ffffff",
};
const FONT = "'Public Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

/** Wrap body content in a branded, table-based email shell (Outlook-safe). */
function emailShell({ preheader, heading, subheading, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(
    preheader
  )}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pageBg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${
    C.white
  };border:1px solid ${C.hairline};border-radius:8px;overflow:hidden;font-family:${FONT};">
<tr><td style="background:${C.red};padding:20px 28px;">
<img src="${LOGO_URL}" width="150" alt="${escapeHtml(BRIGADE_NAME)}" style="display:block;border:0;height:auto;width:150px;max-width:60%;">
</td></tr>
<tr><td style="padding:28px 28px 8px 28px;">
<h1 style="margin:0;font-family:${FONT};font-size:20px;line-height:1.3;color:${C.ink};font-weight:700;">${escapeHtml(
    heading
  )}</h1>
${
  subheading
    ? `<p style="margin:6px 0 0 0;font-family:${FONT};font-size:13px;color:${C.secondary};">${escapeHtml(
        subheading
      )}</p>`
    : ""
}
</td></tr>
<tr><td style="padding:16px 28px 28px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};">
${bodyHtml}
</td></tr>
<tr><td style="padding:18px 28px;background:${C.cardFill};border-top:1px solid ${C.hairline};font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">
${escapeHtml(BRIGADE_NAME)}<br>
<a href="${SOURCE_URL}" style="color:${C.link};text-decoration:none;">bungendorerfs.org</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Render the enquiry message as an accent-bordered quote block. */
function messageBlock(message) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0 0;">
<tr><td style="border-left:3px solid ${C.red};background:${C.cardFill};border-radius:0 6px 6px 0;padding:12px 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};white-space:normal;">${escapeHtml(
    message
  ).replace(/\r?\n/g, "<br>")}</td></tr>
</table>`;
}

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
    ["Name", escapeHtml(data.name)],
    [
      "Email",
      `<a href="mailto:${escapeHtml(data.email)}" style="color:${C.link};text-decoration:none;">${escapeHtml(data.email)}</a>`,
    ],
    [
      "Phone",
      data.phone
        ? `<a href="tel:${escapeHtml(data.phone.replace(/[^\d+]/g, ""))}" style="color:${C.link};text-decoration:none;">${escapeHtml(data.phone)}</a>`
        : "&mdash;",
    ],
    ["Received", escapeHtml(receivedAt)],
  ]
    .map(
      ([label, value], i) =>
        `<tr><td style="padding:${i ? "8" : "0"}px 16px 8px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${C.darkGrey};vertical-align:top;white-space:nowrap;">${escapeHtml(
          label
        )}</td><td style="padding:${i ? "8" : "0"}px 0 8px 0;font-family:${FONT};font-size:15px;color:${C.ink};vertical-align:top;">${value}</td></tr>`
    )
    .join("");

  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
<p style="margin:20px 0 6px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${C.darkGrey};">Enquiry</p>
${messageBlock(data.message)}
<p style="margin:20px 0 0 0;font-family:${FONT};font-size:13px;color:${C.secondary};">Reply to this email to respond to ${escapeHtml(
    data.name
  )} directly &mdash; their address is set as the reply-to.</p>`;

  const html = emailShell({
    preheader: `${data.name}: ${data.message.slice(0, 120)}`,
    heading: "New website enquiry",
    subheading: "Submitted via bungendorerfs.org",
    bodyHtml,
  });

  const plainText = [
    "NEW WEBSITE ENQUIRY",
    "Submitted via bungendorerfs.org",
    "",
    `Name:     ${data.name}`,
    `Email:    ${data.email}`,
    `Phone:    ${data.phone || "—"}`,
    `Received: ${receivedAt}`,
    "",
    "Enquiry:",
    data.message,
    "",
    `Reply to this email to respond to ${data.name} directly.`,
    "",
    "—",
    BRIGADE_NAME,
    SOURCE_URL,
  ].join("\n");

  return { subject: `Website enquiry from ${data.name}`, html, plainText };
}

/** Build the acknowledgement sent back to the enquirer. */
function buildConfirmation(data) {
  const firstName = data.name.split(/\s+/)[0] || data.name;

  const bodyHtml = `<p style="margin:0 0 14px 0;">Thanks ${escapeHtml(firstName)},</p>
<p style="margin:0 0 14px 0;">We&rsquo;ve received your enquiry and one of our team will get back to you. We&rsquo;re
all volunteers, so this might take a few days &mdash; thank you for your patience.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
<tr><td style="border-left:3px solid ${C.calloutFg};background:${C.calloutBg};border-radius:0 6px 6px 0;padding:12px 16px;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.calloutFg};font-weight:700;">
If this enquiry is about an unattended fire, please call 000 now.
</td></tr>
</table>
<p style="margin:0 0 6px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${C.darkGrey};">Your message</p>
${messageBlock(data.message)}
<p style="margin:20px 0 0 0;font-family:${FONT};font-size:12px;color:${C.muted};">
We only use your contact details for this enquiry. This mailbox isn&rsquo;t monitored for
replies &mdash; we&rsquo;ll be in touch from a brigade address.
</p>`;

  const html = emailShell({
    preheader: "We've got your enquiry — one of our volunteers will be in touch.",
    heading: "We've received your enquiry",
    subheading: null,
    bodyHtml,
  });

  const plainText = [
    `Thanks ${firstName},`,
    "",
    "We've received your enquiry and one of our team will get back to you. We're all",
    "volunteers, so this might take a few days - thank you for your patience.",
    "",
    "If this enquiry is about an unattended fire, please call 000 now.",
    "",
    "Your message:",
    data.message,
    "",
    "We only use your contact details for this enquiry. This mailbox isn't monitored",
    "for replies - we'll be in touch from a brigade address.",
    "",
    "—",
    BRIGADE_NAME,
    SOURCE_URL,
  ].join("\n");

  return { subject: "We've received your enquiry — Bungendore RFS", html, plainText };
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
