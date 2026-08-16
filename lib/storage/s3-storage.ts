import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getPublicAssetBaseUrl, getSignedUrlTtlSeconds } from "@/lib/storage/config";

let client: S3Client | null = null;

function getS3Client() {
  if (client) return client;

  const region = process.env.S3_REGION?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();

  client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() ?? "",
    },
  });

  return client;
}

function getBucket() {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) throw new Error("S3_BUCKET is not configured.");
  return bucket;
}

export async function uploadToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
  visibility: "private" | "public";
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
}

export async function deleteFromS3(key: string) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}

export async function getS3SignedUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: getSignedUrlTtlSeconds(),
  });
}

export function getS3PublicUrl(key: string) {
  const base = getPublicAssetBaseUrl();
  if (!base) return null;
  return `${base}/${key.replace(/^public\//, "")}`;
}

export async function readFromS3(key: string) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  const result = await getS3Client().send(command);
  if (!result.Body) {
    throw new Error("Empty object body.");
  }

  const buffer = Buffer.from(await result.Body.transformToByteArray());
  const mime = result.ContentType?.split(";")[0]?.trim() ?? "application/octet-stream";

  return { buffer, mime };
}
