import crypto from "node:crypto";

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.slice(0, 120) || "photo.jpg";
}

export function createPhotoStorageKey(input: { eventId: string; filename: string }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  const safeFilename = sanitizeFilename(input.filename);
  return `events/${input.eventId}/original/${timestamp}-${suffix}-${safeFilename}`;
}
