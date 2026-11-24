import { createHash, timingSafeEqual } from 'node:crypto';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';

export type VerifiedBytes = {
  sizeBytes: bigint;
  sha256Hex: string;
  contentType: 'video/mp4' | 'video/webm';
};

/** Signature detection is only a gate; ffprobe/media decoding belongs to STREAM-005. */
export function sniffVideoContent(prefix: Uint8Array): VerifiedBytes['contentType'] | null {
  if (
    prefix.length >= 12 &&
    prefix[4] === 0x66 &&
    prefix[5] === 0x74 &&
    prefix[6] === 0x79 &&
    prefix[7] === 0x70
  )
    return 'video/mp4';
  if (
    prefix.length >= 4 &&
    prefix[0] === 0x1a &&
    prefix[1] === 0x45 &&
    prefix[2] === 0xdf &&
    prefix[3] === 0xa3
  )
    return 'video/webm';
  return null;
}

/** Streaming bounded verifier: no full video buffers or trust in HEAD metadata. */
export async function verifyUploadBytes(
  source: AsyncIterable<Uint8Array>,
  expectedSizeBytes: bigint,
  expectedChecksumSha256?: string | null,
): Promise<VerifiedBytes> {
  if (expectedSizeBytes < 1n || expectedSizeBytes > BigInt(UPLOAD_LIMITS.maxFileSizeBytes)) {
    throw new AppError(422, 'UPLOAD_INVALID_SIZE', 'Unsupported upload size');
  }
  const hash = createHash('sha256');
  let byteCount = 0n;
  const prefix = Buffer.alloc(12);
  let prefixLength = 0;
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) {
      throw new AppError(422, 'UPLOAD_INVALID_CONTENT', 'Invalid storage byte stream');
    }
    byteCount += BigInt(chunk.byteLength);
    if (byteCount > expectedSizeBytes || byteCount > BigInt(UPLOAD_LIMITS.maxFileSizeBytes)) {
      throw new AppError(422, 'UPLOAD_SIZE_MISMATCH', 'Uploaded bytes exceed expected size');
    }
    const take = Math.min(12 - prefixLength, chunk.byteLength);
    if (take > 0) {
      prefix.set(chunk.subarray(0, take), prefixLength);
      prefixLength += take;
    }
    hash.update(chunk);
  }
  if (byteCount !== expectedSizeBytes) {
    throw new AppError(422, 'UPLOAD_SIZE_MISMATCH', 'Uploaded byte count does not match request');
  }
  const contentType = sniffVideoContent(prefix.subarray(0, prefixLength));
  if (!contentType) {
    throw new AppError(422, 'UPLOAD_INVALID_CONTENT', 'Unsupported video container signature');
  }
  const sha256Hex = hash.digest('hex');
  if (expectedChecksumSha256) {
    if (!/^[a-f0-9]{64}$/u.test(expectedChecksumSha256)) {
      throw new AppError(422, 'UPLOAD_CHECKSUM_INVALID', 'Invalid expected checksum');
    }
    if (
      !timingSafeEqual(Buffer.from(sha256Hex, 'hex'), Buffer.from(expectedChecksumSha256, 'hex'))
    ) {
      throw new AppError(422, 'UPLOAD_CHECKSUM_MISMATCH', 'Uploaded SHA-256 checksum differs');
    }
  }
  return { sizeBytes: byteCount, sha256Hex, contentType };
}
