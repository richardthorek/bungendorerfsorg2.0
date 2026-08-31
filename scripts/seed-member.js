#!/usr/bin/env node
/**
 * One-off: add (or update) a member in the allow-list from the command line.
 * Use it to create the first admin — there's no way to self-serve that through
 * the website.
 *
 *   BRFS_STORAGE_CONNECTION=... \
 *   node scripts/seed-member.js richardthorek-vol@rfs.nsw.gov.au "Richard Thorek" admin
 *
 * Reads BRFS_STORAGE_CONNECTION and AUTH_ALLOWED_EMAIL_DOMAIN from the
 * environment (or a local .env via dotenv).
 */

require("dotenv").config();

const { normalizeEmail, isAllowedDomain, allowedDomain } = require("../api/shared/identity");
const { upsertMember, getMember } = require("../api/shared/store");

async function main() {
  const [, , rawEmail, rawName, rawRole] = process.argv;

  if (!rawEmail) {
    console.error('Usage: node scripts/seed-member.js <email> "<display name>" [member|admin]');
    process.exit(2);
  }
  if (!process.env.BRFS_STORAGE_CONNECTION) {
    console.error("BRFS_STORAGE_CONNECTION is not set.");
    process.exit(2);
  }

  const email = normalizeEmail(rawEmail);
  if (!email) {
    console.error(`Not a valid email address: ${rawEmail}`);
    process.exit(1);
  }
  if (!isAllowedDomain(email)) {
    console.error(`${email} is not on the @${allowedDomain()} domain; it could never sign in.`);
    process.exit(1);
  }

  const role = rawRole === "admin" ? "admin" : "member";
  const displayName = (rawName || "").trim();

  const existed = await getMember(email);
  const saved = await upsertMember({
    email,
    displayName,
    role,
    disabled: false,
    addedBy: "seed-member.js",
  });

  console.log(
    `${existed ? "Updated" : "Added"} ${saved.email} — ${saved.displayName || "(no name)"} [${saved.role}]`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
