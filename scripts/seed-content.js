#!/usr/bin/env node
/**
 * One-off: copy the bundled community-events and training-schedule JSON into
 * the `content` table so the members' area has something to edit. Safe to
 * re-run — it overwrites.
 *
 *   BRFS_STORAGE_CONNECTION=... node scripts/seed-content.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { validateContent } = require("../api/shared/contentSchema");
const { setContent, getContent } = require("../api/shared/store");

const SOURCES = {
  events: "communityEvents.json",
  training: "trainingSchedule.json",
};

async function main() {
  if (!process.env.BRFS_STORAGE_CONNECTION) {
    console.error("BRFS_STORAGE_CONNECTION is not set.");
    process.exit(2);
  }

  for (const [key, file] of Object.entries(SOURCES)) {
    const existing = await getContent(key);
    if (existing && existing.items.length) {
      console.log(
        `${key}: already has ${existing.items.length} items — skipping (delete the row to reseed).`
      );
      continue;
    }
    const raw = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "public", "Content", file), "utf8")
    );
    const result = validateContent(key, raw);
    if (!result.ok) {
      console.error(`${key}: ${file} failed validation — ${result.error}`);
      process.exit(1);
    }
    await setContent(key, result.items, "seed-content.js");
    console.log(`${key}: seeded ${result.items.length} items from ${file}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
