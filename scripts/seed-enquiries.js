#!/usr/bin/env node
/**
 * Bulk-import historical enquiries into the `enquiries` table.
 *
 *   BRFS_STORAGE_CONNECTION=... node scripts/seed-enquiries.js path/to/enquiries.json
 *
 * The JSON is an array of objects; each needs at least name + message. Optional:
 * email, phone, receivedAt (ISO), legacyRef. A starter file with the three
 * recoverable enquiries is at scripts/data/enquiries-seed.example.json.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { recordEnquiry, listEnquiries } = require("../api/shared/store");

async function main() {
  const file = process.argv[2] || "scripts/data/enquiries-seed.example.json";
  if (!process.env.BRFS_STORAGE_CONNECTION) {
    console.error("BRFS_STORAGE_CONNECTION is not set.");
    process.exit(2);
  }

  const rows = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if (!Array.isArray(rows)) {
    console.error("Expected a JSON array of enquiries.");
    process.exit(1);
  }

  const existing = await listEnquiries(2000);
  const seenRefs = new Set(existing.map((e) => e.legacyRef).filter(Boolean));

  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row || !row.name || !row.message) {
      console.warn(`skipping row without name/message: ${JSON.stringify(row).slice(0, 80)}`);
      continue;
    }
    if (row.legacyRef && seenRefs.has(String(row.legacyRef))) {
      skipped += 1;
      continue;
    }
    await recordEnquiry({
      name: row.name,
      email: row.email || "",
      phone: row.phone || "",
      message: row.message,
      receivedAt: row.receivedAt || undefined,
      legacyRef: row.legacyRef || "",
      source: "seed",
    });
    added += 1;
  }

  console.log(`Imported ${added} enquiries (${skipped} already present by legacyRef).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
