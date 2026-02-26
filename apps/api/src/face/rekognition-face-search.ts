import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand
} from "@aws-sdk/client-rekognition";
import { PhotoStatus, type Photo } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializePhoto, type SerializedPhoto } from "../photos/serialize-photo.js";

export const FACE_PROVIDER = "aws-rekognition";

type FaceIndexStatus = "indexed" | "no_face_detected" | "disabled" | "error";

export interface FaceIndexResult {
  status: FaceIndexStatus;
  message?: string;
}

type SelfieSearchStatus = "ok" | "no_matches" | "no_face_detected" | "disabled" | "error";

export interface SelfieMatchItem {
  similarity: number;
  photo: SerializedPhoto;
}

export interface SelfieSearchResult {
  status: SelfieSearchStatus;
  matches: SelfieMatchItem[];
  message?: string;
}

interface FaceSearchConfig {
  bucket: string;
  collectionId: string;
  region: string;
}

let rekognitionClient: RekognitionClient | null = null;
let collectionReady = false;

function getFaceSearchConfig(): FaceSearchConfig | null {
  const bucket = process.env.S3_BUCKET;
  const collectionId = process.env.AWS_REKOGNITION_COLLECTION_ID;

  if (!bucket || !collectionId) {
    return null;
  }

  return {
    bucket,
    collectionId,
    region:
      process.env.AWS_REKOGNITION_REGION ??
      process.env.AWS_REGION ??
      process.env.S3_REGION ??
      "us-east-1"
  };
}

function getRekognitionClient() {
  if (rekognitionClient) {
    return rekognitionClient;
  }

  const config = getFaceSearchConfig();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  rekognitionClient = new RekognitionClient({
    region: config?.region ?? "us-east-1",
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            sessionToken
          }
        : undefined
  });

  return rekognitionClient;
}

async function ensureCollection(config: FaceSearchConfig) {
  if (collectionReady) {
    return;
  }

  const client = getRekognitionClient();

  try {
    await client.send(
      new DescribeCollectionCommand({
        CollectionId: config.collectionId
      })
    );
    collectionReady = true;
    return;
  } catch (error) {
    if ((error as { name?: string }).name !== "ResourceNotFoundException") {
      throw error;
    }
  }

  await client.send(
    new CreateCollectionCommand({
      CollectionId: config.collectionId
    })
  );

  collectionReady = true;
}

async function clearExistingPhotoFaces(photoId: string) {
  const existingFaces = await prisma.faceEmbedding.findMany({
    where: {
      photoId,
      provider: FACE_PROVIDER
    },
    select: {
      externalId: true
    }
  });

  const faceIds = existingFaces.map((face) => face.externalId);
  const config = getFaceSearchConfig();

  if (config && faceIds.length > 0) {
    try {
      await getRekognitionClient().send(
        new DeleteFacesCommand({
          CollectionId: config.collectionId,
          FaceIds: faceIds
        })
      );
    } catch {
      // Best-effort cleanup. We still clean local mappings below.
    }
  }

  await prisma.faceEmbedding.deleteMany({
    where: {
      photoId,
      provider: FACE_PROVIDER
    }
  });
}

export async function indexPhotoFace(photo: Pick<Photo, "id" | "storageKey">): Promise<FaceIndexResult> {
  const config = getFaceSearchConfig();

  if (!config) {
    return {
      status: "disabled",
      message: "Face search is not configured."
    };
  }

  try {
    await ensureCollection(config);
    await clearExistingPhotoFaces(photo.id);

    const response = await getRekognitionClient().send(
      new IndexFacesCommand({
        CollectionId: config.collectionId,
        ExternalImageId: photo.id,
        MaxFaces: 1,
        Image: {
          S3Object: {
            Bucket: config.bucket,
            Name: photo.storageKey
          }
        }
      })
    );

    const faceRecords = response.FaceRecords ?? [];
    const firstFace = faceRecords[0]?.Face;
    const faceId = firstFace?.FaceId;

    if (!faceId) {
      return {
        status: "no_face_detected",
        message: "No clear face detected in this photo."
      };
    }

    if (faceRecords.length > 1) {
      const extraFaceIds = faceRecords
        .slice(1)
        .map((record) => record.Face?.FaceId)
        .filter((value): value is string => Boolean(value));

      if (extraFaceIds.length > 0) {
        await getRekognitionClient().send(
          new DeleteFacesCommand({
            CollectionId: config.collectionId,
            FaceIds: extraFaceIds
          })
        );
      }
    }

    await prisma.faceEmbedding.create({
      data: {
        photoId: photo.id,
        provider: FACE_PROVIDER,
        externalId: faceId,
        confidence: firstFace.Confidence ?? null
      }
    });

    return { status: "indexed" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to index face."
    };
  }
}

function getMatchThreshold() {
  const threshold = Number(process.env.FACE_MATCH_THRESHOLD ?? "80");
  return Number.isFinite(threshold) ? Math.max(0, Math.min(100, threshold)) : 80;
}

export async function findSelfieMatches(input: {
  eventId: string;
  selfieBytes: Buffer;
  limit: number;
}): Promise<SelfieSearchResult> {
  const config = getFaceSearchConfig();

  if (!config) {
    return {
      status: "disabled",
      matches: [],
      message: "Face search is not configured."
    };
  }

  try {
    await ensureCollection(config);

    const response = await getRekognitionClient().send(
      new SearchFacesByImageCommand({
        CollectionId: config.collectionId,
        Image: {
          Bytes: input.selfieBytes
        },
        MaxFaces: 50,
        FaceMatchThreshold: getMatchThreshold()
      })
    );

    const faceMatches = response.FaceMatches ?? [];

    if (faceMatches.length === 0) {
      return {
        status: "no_matches",
        matches: []
      };
    }

    const similarityByFaceId = new Map<string, number>();

    for (const match of faceMatches) {
      const faceId = match.Face?.FaceId;
      const similarity = match.Similarity;

      if (!faceId || typeof similarity !== "number") {
        continue;
      }

      const previous = similarityByFaceId.get(faceId) ?? 0;
      if (similarity > previous) {
        similarityByFaceId.set(faceId, similarity);
      }
    }

    const faceIds = Array.from(similarityByFaceId.keys());

    if (faceIds.length === 0) {
      return {
        status: "no_face_detected",
        matches: [],
        message: "No face detected in the selfie."
      };
    }

    const faceEmbeddings = await prisma.faceEmbedding.findMany({
      where: {
        provider: FACE_PROVIDER,
        externalId: { in: faceIds },
        photo: {
          eventId: input.eventId,
          status: PhotoStatus.PUBLISHED,
          isUploaded: true
        }
      },
      include: {
        photo: true
      }
    });

    if (faceEmbeddings.length === 0) {
      return {
        status: "no_matches",
        matches: []
      };
    }

    const bestByPhotoId = new Map<
      string,
      {
        similarity: number;
        photo: Photo;
      }
    >();

    for (const embedding of faceEmbeddings) {
      const similarity = similarityByFaceId.get(embedding.externalId) ?? 0;
      const previous = bestByPhotoId.get(embedding.photoId);

      if (!previous || similarity > previous.similarity) {
        bestByPhotoId.set(embedding.photoId, {
          similarity,
          photo: embedding.photo
        });
      }
    }

    const topMatches = Array.from(bestByPhotoId.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, input.limit);

    const serializedMatches = await Promise.all(
      topMatches.map(async (match) => ({
        similarity: match.similarity,
        photo: await serializePhoto(match.photo)
      }))
    );

    return {
      status: "ok",
      matches: serializedMatches
    };
  } catch (error) {
    if ((error as { name?: string }).name === "InvalidParameterException") {
      return {
        status: "no_face_detected",
        matches: [],
        message: "No face detected in the selfie."
      };
    }

    return {
      status: "error",
      matches: [],
      message: error instanceof Error ? error.message : "Face match search failed."
    };
  }
}
