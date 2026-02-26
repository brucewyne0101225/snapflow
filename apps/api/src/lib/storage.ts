import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

function getStorageConfig(): StorageConfig {
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error("S3_BUCKET is required");
  }

  return {
    bucket,
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
  };
}

let storageClient: S3Client | null = null;

function getStorageClient() {
  if (storageClient) {
    return storageClient;
  }

  const config = getStorageConfig();
  const hasCredentials = Boolean(config.accessKeyId && config.secretAccessKey);

  storageClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: hasCredentials
      ? {
          accessKeyId: config.accessKeyId as string,
          secretAccessKey: config.secretAccessKey as string
        }
      : undefined
  });

  return storageClient;
}

export async function createSignedUploadUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const config = getStorageConfig();
  const client = getStorageClient();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType
  });

  return getSignedUrl(client, command, { expiresIn: input.expiresInSeconds ?? 900 });
}

export async function createSignedDownloadUrl(input: {
  key: string;
  expiresInSeconds?: number;
}) {
  const config = getStorageConfig();
  const client = getStorageClient();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.key
  });

  return getSignedUrl(client, command, { expiresIn: input.expiresInSeconds ?? 3600 });
}
