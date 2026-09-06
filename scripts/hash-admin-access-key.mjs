import { createHash } from "node:crypto";

const accessKey = process.env.ADMIN_ACCESS_KEY;

if (!accessKey || accessKey.length < 24) {
  console.error("Set ADMIN_ACCESS_KEY to a private administrator key of at least 24 characters before hashing it.");
  process.exit(1);
}

const digest = createHash("sha256").update(accessKey, "utf8").digest("hex");
console.log(digest);
