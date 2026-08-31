/**
 * Emails a members'-area sign-in code via Azure Communication Services.
 * Reuses ACS_CONNECTION_STRING / ACS_SENDER_ADDRESS from the contact-form setup.
 */

const { EmailClient } = require("@azure/communication-email");

const SITE_URL = "https://www.bungendorerfs.org";
const C = { red: "#e5281b", ink: "#22201f", soft: "#5c5651", fill: "#f6f5f2", hairline: "#ece9e4" };
const FONT = "'Public Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCodeEmail(code, minutes) {
  // No literal separators between digits (previously a thin space) so that
  // copy-and-paste from the email yields the bare 6-digit code.  Visual
  // separation is done with letter-spacing in the styles below.
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid ${C.hairline};border-radius:8px;overflow:hidden;font-family:${FONT};">
<tr><td style="background:${C.red};padding:16px 24px;color:#fff;font-weight:700;font-size:14px;letter-spacing:.04em;">BUNGENDORE RFS &mdash; MEMBERS</td></tr>
<tr><td style="padding:24px;">
<p style="margin:0 0 8px;font-size:15px;color:${C.ink};">Your sign-in code:</p>
<p style="margin:0 0 8px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:30px;font-weight:600;letter-spacing:.4em;color:${C.ink};">${escapeHtml(code)}</p>
<p style="margin:0;font-size:13px;color:${C.soft};">Expires in ${minutes} minutes. It can be used once. If you didn&rsquo;t ask to sign in, ignore this email &mdash; no action is needed.</p>
</td></tr>
<tr><td style="padding:14px 24px;background:${C.fill};border-top:1px solid ${C.hairline};font-size:12px;color:#9a9a9a;font-family:${FONT};">Bungendore Volunteer Rural Fire Brigade &middot; ${escapeHtml(SITE_URL)}</td></tr>
</table></td></tr></table></body></html>`;

  const plainText = [
    "Bungendore RFS — members' area sign-in code",
    "",
    `Code: ${code}`,
    `Expires in ${minutes} minutes. Single use.`,
    "",
    "If you didn't ask to sign in, ignore this email.",
  ].join("\n");

  return { subject: `${code} is your Bungendore RFS sign-in code`, html, plainText };
}

/**
 * @param {string} email     recipient (already validated / allow-listed)
 * @param {string} code      6-digit code
 * @param {number} minutes   code lifetime, for the copy
 * @param {object} [options] { env, clientFactory } for tests
 */
async function sendSignInCode(email, code, minutes, options = {}) {
  const env = options.env || process.env;
  const connectionString = env.ACS_CONNECTION_STRING;
  const senderAddress = env.ACS_SENDER_ADDRESS;
  if (!connectionString || !senderAddress) {
    throw new Error(
      "Email sign-in not configured: missing ACS_CONNECTION_STRING / ACS_SENDER_ADDRESS"
    );
  }

  const client = options.clientFactory
    ? options.clientFactory(connectionString)
    : new EmailClient(connectionString);

  const msg = buildCodeEmail(code, minutes);
  const poller = await client.beginSend({
    senderAddress,
    content: { subject: msg.subject, plainText: msg.plainText, html: msg.html },
    recipients: { to: [{ address: email }] },
  });
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") {
    throw new Error(`Sign-in code email finished with status ${result.status}`);
  }
  return { id: result.id };
}

module.exports = { escapeHtml, buildCodeEmail, sendSignInCode };
