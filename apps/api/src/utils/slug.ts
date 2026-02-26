import crypto from "node:crypto";

function normalizeBaseSlug(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "event";
}

export function generateEventSlug(name: string) {
  const base = normalizeBaseSlug(name);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}
