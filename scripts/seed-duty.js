#!/usr/bin/env node
/**
 * One-off: set the duty-line forwarding number directly (used for the initial
 * cut-over from the SharePoint lookup).
 *
 *   BRFS_STORAGE_CONNECTION=... node scripts/seed-duty.js +61488880286
 */

require("dotenv").config();

const { normalizeAuPhone } = require("../api/shared/phone");
const { setDuty, getDuty } = require("../api/shared/store");

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: node scripts/seed-duty.js <phone number>");
    process.exit(2);
  }
  if (!process.env.BRFS_STORAGE_CONNECTION) {
    console.error("BRFS_STORAGE_CONNECTION is not set.");
    process.exit(2);
  }

  const number = normalizeAuPhone(raw);
  if (!number) {
    console.error(`Not a valid Australian phone number: ${raw}`);
    process.exit(1);
  }

  await setDuty({ number, setBy: "seed-duty.js", setByName: "", method: "seed" });
  const now = await getDuty();
  console.log(`Duty line set to ${now.number}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
