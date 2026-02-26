import { PhotoStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { assertEventOwner } from "../events/event-access.js";
import { FACE_PROVIDER, indexPhotoFace } from "../face/rekognition-face-search.js";
import { prisma } from "../lib/prisma.js";
import { createSignedUploadUrl } from "../lib/storage.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { serializePhoto } from "../photos/serialize-photo.js";
import { createPhotoStorageKey } from "../photos/storage-key.js";
import { publishEventUpdate } from "../realtime/event-updates.js";
import { asyncHandler } from "../server/async-handler.js";

const uploadInitSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  fileSize: z.coerce.number().int().min(1).max(50_000_000),
  width: z.coerce.number().int().min(1).max(50_000).optional(),
  height: z.coerce.number().int().min(1).max(50_000).optional(),
  capturedAt: z.coerce.date().optional()
});

const eventParamsSchema = z.object({
  eventId: z.string().min(1)
});

const photoParamsSchema = z.object({
  eventId: z.string().min(1),
  photoId: z.string().min(1)
});

const photoQuerySchema = z.object({
  status: z.enum(["all", "draft", "published"]).optional().default("all")
});

export const eventPhotosRouter = Router();

eventPhotosRouter.use(requireAuth);

eventPhotosRouter.post(
  "/:eventId/photos/upload-url",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = eventParamsSchema.parse(req.params);
    const event = await assertEventOwner({ eventId, ownerId: userId });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const input = uploadInitSchema.parse(req.body);
    const storageKey = createPhotoStorageKey({
      eventId,
      filename: input.fileName
    });

    const photo = await prisma.photo.create({
      data: {
        eventId,
        storageKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        width: input.width,
        height: input.height,
        capturedAt: input.capturedAt,
        status: PhotoStatus.DRAFT
      }
    });

    const uploadUrl = await createSignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType
    });

    res.status(201).json({
      upload: {
        method: "PUT",
        url: uploadUrl,
        headers: {
          "Content-Type": input.mimeType
        }
      },
      photo: {
        id: photo.id,
        eventId: photo.eventId,
        status: photo.status,
        isUploaded: photo.isUploaded
      }
    });
  })
);

eventPhotosRouter.post(
  "/:eventId/photos/:photoId/complete",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId, photoId } = photoParamsSchema.parse(req.params);
    const event = await assertEventOwner({ eventId, ownerId: userId });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        eventId
      }
    });

    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const updated = await prisma.photo.update({
      where: { id: photo.id },
      data: {
        isUploaded: true,
        uploadedAt: new Date()
      }
    });

    const faceIndexing = await indexPhotoFace(updated);
    publishEventUpdate({
      eventSlug: event.slug,
      photoId: updated.id,
      type: "photo.uploaded"
    });
    res.json({ photo: await serializePhoto(updated), faceIndexing });
  })
);

eventPhotosRouter.get(
  "/:eventId/photos",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = eventParamsSchema.parse(req.params);
    const query = photoQuerySchema.parse(req.query);
    const event = await assertEventOwner({ eventId, ownerId: userId });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const statusFilter =
      query.status === "all"
        ? undefined
        : query.status === "published"
          ? PhotoStatus.PUBLISHED
          : PhotoStatus.DRAFT;

    const photos = await prisma.photo.findMany({
      where: {
        eventId,
        isUploaded: true,
        status: statusFilter
      },
      orderBy: [{ createdAt: "desc" }]
    });

    const serialized = await Promise.all(photos.map((photo) => serializePhoto(photo)));
    res.json({ photos: serialized });
  })
);

eventPhotosRouter.post(
  "/:eventId/photos/:photoId/publish",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId, photoId } = photoParamsSchema.parse(req.params);
    const event = await assertEventOwner({ eventId, ownerId: userId });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const existingPhoto = await prisma.photo.findFirst({
      where: {
        id: photoId,
        eventId
      }
    });

    if (!existingPhoto) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    if (!existingPhoto.isUploaded) {
      res.status(400).json({ error: "Photo upload is not complete" });
      return;
    }

    const updated = await prisma.photo.update({
      where: { id: existingPhoto.id },
      data: {
        status: PhotoStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });

    const hasIndexedFace = await prisma.faceEmbedding.findFirst({
      where: {
        photoId: updated.id,
        provider: FACE_PROVIDER
      },
      select: { id: true }
    });

    const faceIndexing = hasIndexedFace ? undefined : await indexPhotoFace(updated);
    publishEventUpdate({
      eventSlug: event.slug,
      photoId: updated.id,
      type: "photo.published"
    });

    res.json({ photo: await serializePhoto(updated), faceIndexing });
  })
);

eventPhotosRouter.post(
  "/:eventId/photos/:photoId/unpublish",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId, photoId } = photoParamsSchema.parse(req.params);
    const event = await assertEventOwner({ eventId, ownerId: userId });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const existingPhoto = await prisma.photo.findFirst({
      where: {
        id: photoId,
        eventId
      }
    });

    if (!existingPhoto) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const updated = await prisma.photo.update({
      where: { id: existingPhoto.id },
      data: {
        status: PhotoStatus.DRAFT,
        publishedAt: null
      }
    });
    publishEventUpdate({
      eventSlug: event.slug,
      photoId: updated.id,
      type: "photo.unpublished"
    });

    res.json({ photo: await serializePhoto(updated) });
  })
);
