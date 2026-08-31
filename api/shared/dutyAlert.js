/**
 * Emails a short notice whenever the brigade phone number changes, so there is
 * always an off-system record of who took the line and when.
 * Reuses ACS_CONNECTION_STRING / ACS_SENDER_ADDRESS; recipient DUTY_ALERT_TO
 * (falls back to CONTACT_NOTIFY_TO). Best-effort — never blocks the change.
 */

const { EmailClient } = require("@azure/communication-email");
const { maskPhone } = require("./phone");

const C = { red: "#e5281b", ink: "#22201f", soft: "#5c5651", fill: "#f6f5f2", hairline: "#ece9e4" };
const FONT = "'Public Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

function esc(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso) {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Sydney",
    }).format(iso ? new Date(iso) : new Date());
  } catch {
    return iso || "";
  }
}

/**
 * @param {{number:string, setByName?:string, setBy?:string, method:string, setAt?:string, previous?:string}} change
 * @param {object} [options] { env, clientFactory } for tests
 */
async function sendDutyChangeAlert(change, options = {}) {
  const env = options.env || process.env;
  const connectionString = env.ACS_CONNECTION_STRING;
  const senderAddress = env.ACS_SENDER_ADDRESS;
  const to = (env.DUTY_ALERT_TO || env.CONTACT_NOTIFY_TO || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!connectionString || !senderAddress || to.length === 0) {
    return { skipped: true };
  }

  const who = change.setByName || change.setBy || "an unrecognised number";
  const via =
    change.method === "sms"
      ? "by SMS"
      : change.method === "web"
        ? "from the website"
        : `(${change.method})`;
  const when = formatWhen(change.setAt);

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="460" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;background:#fff;border:1px solid ${C.hairline};border-radius:8px;overflow:hidden;font-family:${FONT};">
<tr><td style="background:${C.red};padding:14px 22px;color:#fff;font-weight:700;font-size:13px;letter-spacing:.04em;">BUNGENDORE RFS — BRIGADE PHONE</td></tr>
<tr><td style="padding:20px 22px;font-size:15px;color:${C.ink};line-height:1.6;">
The brigade phone now forwards to <strong>${esc(change.number)}</strong>.<br>
Set ${esc(via)} by ${esc(who)}${change.setByName || change.setBy ? "" : ` (${esc(maskPhone(change.number))})`}.<br>
<span style="color:${C.soft};font-size:13px;">${esc(when)}${change.previous ? ` — previously ${esc(change.previous)}` : ""}</span>
</td></tr>
<tr><td style="padding:12px 22px;background:${C.fill};border-top:1px solid ${C.hairline};font-size:12px;color:#9a9a9a;">Manage this at bungendorerfs.org/admin</td></tr>
</table></td></tr></table></body></html>`;

  const plainText = [
    "Bungendore RFS — brigade phone changed",
    "",
    `Now forwards to: ${change.number}`,
    `Set ${via} by ${who}`,
    when,
    change.previous ? `Previously: ${change.previous}` : "",
    "",
    "Manage at bungendorerfs.org/admin",
  ]
    .filter(Boolean)
    .join("\n");

  const client = options.clientFactory
    ? options.clientFactory(connectionString)
    : new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress,
    content: { subject: `Brigade phone → ${maskPhone(change.number)}`, plainText, html },
    recipients: { to: to.map((address) => ({ address })) },
  });
  await poller.pollUntilDone();
  return { sent: true };
}

module.exports = { sendDutyChangeAlert };
