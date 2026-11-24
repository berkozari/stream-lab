import { UPLOAD_LIMITS, type CompleteMultipartUploadRequest } from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';

export type StoredMultipartPart = { partNumber: number; etag: string; sizeBytes: number };
const partSize = UPLOAD_LIMITS.multipartPartSizeBytes;

export function partCount(sizeBytes: bigint): number {
  if (
    sizeBytes <= BigInt(UPLOAD_LIMITS.singlePutLimitBytes) ||
    sizeBytes > BigInt(UPLOAD_LIMITS.maxFileSizeBytes)
  ) {
    throw new AppError(
      422,
      'MULTIPART_SIZE_INVALID',
      'Multipart file size is outside the allowed range',
    );
  }
  return Number((sizeBytes + BigInt(partSize) - 1n) / BigInt(partSize));
}

export function expectedPartSize(sizeBytes: bigint, number: number): number {
  const count = partCount(sizeBytes);
  if (!Number.isSafeInteger(number) || number < 1 || number > count) {
    throw new AppError(422, 'PART_NUMBER_INVALID', 'Part number is outside the upload range');
  }
  return number < count ? partSize : Number(sizeBytes - BigInt(count - 1) * BigInt(partSize));
}

// ETags are S3 opaque identifiers, NOT content checksums. Do not compute MD5/SHA-256 from them.
export function normalizedEtag(etag: string): string {
  const value = etag.trim();
  if (!/^"?[\x21-\x7e]+"?$/u.test(value) || value.includes(',') || value.includes('\\')) {
    throw new AppError(422, 'PART_ETAG_INVALID', 'Invalid S3 part ETag');
  }
  return value.replace(/^"|"$/gu, '');
}

/** Verify all parts (including their exact size) from S3 ListParts, not only browser receipts. */
export function verifyMultipartReceipts(
  sizeBytes: bigint,
  listed: StoredMultipartPart[],
  submitted: CompleteMultipartUploadRequest['parts'],
): Array<{ PartNumber: number; ETag: string }> {
  const expected = partCount(sizeBytes);
  if (listed.length !== expected || submitted.length !== expected) {
    throw new AppError(409, 'MULTIPART_PARTS_MISSING', 'Not all expected parts have been uploaded');
  }
  const byNumber = new Map(listed.map((part) => [part.partNumber, part]));
  if (byNumber.size !== expected) {
    throw new AppError(409, 'MULTIPART_PARTS_INVALID', 'Duplicate or missing S3 part numbers');
  }
  return submitted.map((part, index) => {
    if (part.partNumber !== index + 1) {
      throw new AppError(422, 'MULTIPART_PART_ORDER', 'Part numbers must be consecutive');
    }
    const stored = byNumber.get(part.partNumber);
    if (
      !stored ||
      stored.sizeBytes !== expectedPartSize(sizeBytes, part.partNumber) ||
      normalizedEtag(part.etag) !== normalizedEtag(stored.etag)
    ) {
      throw new AppError(
        409,
        'MULTIPART_PART_MISMATCH',
        'S3 part size or ETag differs from receipt',
      );
    }
    return { PartNumber: part.partNumber, ETag: stored.etag };
  });
}
