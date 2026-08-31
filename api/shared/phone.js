/**
 * Australian phone-number normalisation for the duty line.
 * Accepts local (0…) or international (+61…/0061…) forms and returns E.164,
 * or "" if it isn't a plausible AU mobile or landline.
 */

function normalizeAuPhone(value) {
  if (typeof value !== "string") return "";
  let digits = value.replace(/[\s()\-.]/g, "");

  if (digits.startsWith("+61")) digits = "0" + digits.slice(3);
  else if (digits.startsWith("0061")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("61") && digits.length === 11) digits = "0" + digits.slice(2);

  // now expect 0 + 9 digits, second digit 2-9 (mobiles start 04)
  if (!/^0[2-9]\d{8}$/.test(digits)) return "";
  return "+61" + digits.slice(1);
}

/** Last 4 digits with the rest masked, e.g. "•••• ••• 0286". */
function maskPhone(e164) {
  if (!e164 || e164.length < 4) return "";
  const last4 = e164.slice(-4);
  return `•••• ••• ${last4}`;
}

module.exports = { normalizeAuPhone, maskPhone };
