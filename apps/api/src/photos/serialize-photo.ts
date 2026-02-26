import type { Photo, PhotoStatus } from "@prisma/client";
import { createSignedDownloadUrl } from "../lib/storage.js";

export interface SerializedPhoto {
  id: string;
  eventId: string;
  status: PhotoStatus;
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
}

export async function serializePhoto(photo: Photo): Promise<SerializedPhoto> {
  const previewUrl = await createSignedDownloadUrl({ key: photo.storageKey });

  return {
    id: photo.id,
    eventId: photo.eventId,
    status: photo.status,
    mimeType: photo.mimeType,
    fileSize: photo.fileSize,
    width: photo.width,
    height: photo.height,
    capturedAt: photo.capturedAt?.toISOString() ?? null,
    publishedAt: photo.publishedAt?.toISOString() ?? null,
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
    previewUrl
  };
}
