import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { AppError } from "../errors/errors.js";

export type OssUploaderConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type OssUploadResult = {
  bucket: string;
  key: string;
  url: string;
  httpsUrl: string;
  etag?: string;
};

function buildHttpsUrl(config: OssUploaderConfig, key: string): string {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (config.forcePathStyle) {
    return `${endpoint}/${config.bucket}/${encodedKey}`;
  }
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${config.bucket}.${parsed.host}/${encodedKey}`;
  } catch {
    return `${endpoint}/${config.bucket}/${encodedKey}`;
  }
}

export class OssUploader {
  private readonly client: S3Client;

  constructor(private readonly config: OssUploaderConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async upload(input: {
    key: string;
    body: string | Uint8Array;
    contentType?: string;
  }): Promise<OssUploadResult> {
    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType ?? "text/markdown; charset=utf-8"
        })
      );
      return {
        bucket: this.config.bucket,
        key: input.key,
        url: `oss://${this.config.bucket}/${input.key}`,
        httpsUrl: buildHttpsUrl(this.config, input.key),
        etag: response.ETag
      };
    } catch (error) {
      throw new AppError(
        "OSS_UPLOAD_FAILED",
        error instanceof Error ? error.message : "OSS upload failed."
      );
    }
  }

  async head(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      throw new AppError(
        "OSS_UPLOAD_FAILED",
        error instanceof Error ? error.message : "OSS bucket not reachable."
      );
    }
  }

  async getObject(key: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key })
      );
      return await response.Body!.transformToString("utf8");
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        return undefined;
      }
      throw new AppError(
        "OSS_UPLOAD_FAILED",
        error instanceof Error ? error.message : "OSS get failed."
      );
    }
  }
}
