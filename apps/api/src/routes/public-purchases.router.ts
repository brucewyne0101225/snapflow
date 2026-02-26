import { PhotoStatus } from "@prisma/client";
import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { createSignedDownloadUrl } from "../lib/storage.js";
import { PURCHASE_ITEM_ALL_PHOTOS } from "../payments/constants.js";
import { signPurchaseAccessToken, verifyPurchaseAccessToken } from "../payments/purchase-access-token.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../server/async-handler.js";

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1)
});

const purchaseParamsSchema = z.object({
  purchaseId: z.string().min(1)
});

const purchasePhotoParamsSchema = z.object({
  purchaseId: z.string().min(1),
  photoId: z.string().min(1)
});

function getPurchaseTokenFromRequest(req: Request) {
  const authHeader = req.header("authorization");
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const headerToken = req.header("x-purchase-token");

  return bearerToken ?? queryToken ?? headerToken ?? null;
}

async function getPaidPurchaseWithItems(purchaseId: string) {
  return prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      status: "PAID"
    },
    include: {
      items: true,
      event: {
        select: {
          id: true,
          slug: true,
          name: true
        }
      }
    }
  });
}

export const publicPurchasesRouter = Router();

publicPurchasesRouter.get(
  "/session/:sessionId",
  asyncHandler(async (req, res) => {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    const purchase = await prisma.purchase.findUnique({
      where: {
        stripeSessionId: sessionId
      },
      include: {
        items: true,
        event: {
          select: {
            id: true,
            slug: true,
            name: true
          }
        }
      }
    });

    if (!purchase) {
      res.status(404).json({ error: "Purchase not found for this session." });
      return;
    }

    if (purchase.status !== "PAID") {
      res.status(402).json({ error: "Purchase is not paid yet.", status: purchase.status });
      return;
    }

    const hasAllPhotos = purchase.items.some((item) => item.itemType === PURCHASE_ITEM_ALL_PHOTOS);
    const purchasedPhotoIds = purchase.items
      .map((item) => item.photoId)
      .filter((value): value is string => Boolean(value));

    const accessToken = signPurchaseAccessToken({ purchaseId: purchase.id });

    res.json({
      purchase: {
        id: purchase.id,
        status: purchase.status,
        eventId: purchase.eventId,
        eventSlug: purchase.event.slug,
        eventName: purchase.event.name,
        buyerEmail: purchase.buyerEmail,
        hasAllPhotos,
        purchasedPhotoIds
      },
      accessToken
    });
  })
);

publicPurchasesRouter.get(
  "/:purchaseId/download/photo/:photoId",
  asyncHandler(async (req, res) => {
    const { purchaseId, photoId } = purchasePhotoParamsSchema.parse(req.params);
    const token = getPurchaseTokenFromRequest(req);

    if (!token) {
      res.status(401).json({ error: "Purchase access token is required." });
      return;
    }

    try {
      verifyPurchaseAccessToken({ purchaseId, token });
    } catch {
      res.status(401).json({ error: "Invalid purchase access token." });
      return;
    }

    const purchase = await getPaidPurchaseWithItems(purchaseId);

    if (!purchase) {
      res.status(404).json({ error: "Paid purchase not found." });
      return;
    }

    const hasAllPhotos = purchase.items.some((item) => item.itemType === PURCHASE_ITEM_ALL_PHOTOS);
    const hasPhotoAccess = purchase.items.some((item) => item.photoId === photoId);

    if (!hasAllPhotos && !hasPhotoAccess) {
      res.status(403).json({ error: "Photo is not included in this purchase." });
      return;
    }

    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        eventId: purchase.eventId,
        isUploaded: true
      },
      select: {
        id: true,
        storageKey: true
      }
    });

    if (!photo) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    const downloadUrl = await createSignedDownloadUrl({
      key: photo.storageKey,
      expiresInSeconds: 600
    });

    res.json({
      photoId: photo.id,
      downloadUrl
    });
  })
);

publicPurchasesRouter.get(
  "/:purchaseId/download/all",
  asyncHandler(async (req, res) => {
    const { purchaseId } = purchaseParamsSchema.parse(req.params);
    const token = getPurchaseTokenFromRequest(req);

    if (!token) {
      res.status(401).json({ error: "Purchase access token is required." });
      return;
    }

    try {
      verifyPurchaseAccessToken({ purchaseId, token });
    } catch {
      res.status(401).json({ error: "Invalid purchase access token." });
      return;
    }

    const purchase = await getPaidPurchaseWithItems(purchaseId);

    if (!purchase) {
      res.status(404).json({ error: "Paid purchase not found." });
      return;
    }

    const hasAllPhotos = purchase.items.some((item) => item.itemType === PURCHASE_ITEM_ALL_PHOTOS);

    if (!hasAllPhotos) {
      res.status(403).json({ error: "All-photos bundle was not purchased." });
      return;
    }

    const photos = await prisma.photo.findMany({
      where: {
        eventId: purchase.eventId,
        isUploaded: true,
        status: PhotoStatus.PUBLISHED
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        storageKey: true
      }
    });

    const files = await Promise.all(
      photos.map(async (photo) => ({
        photoId: photo.id,
        downloadUrl: await createSignedDownloadUrl({
          key: photo.storageKey,
          expiresInSeconds: 600
        })
      }))
    );

    res.json({
      count: files.length,
      files
    });
  })
);
