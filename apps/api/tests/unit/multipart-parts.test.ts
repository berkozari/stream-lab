import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import {
  expectedPartSize,
  partCount,
  verifyMultipartReceipts,
} from '../../src/lib/multipart-parts.js';

const part = UPLOAD_LIMITS.multipartPartSizeBytes;
const total = BigInt(UPLOAD_LIMITS.singlePutLimitBytes + 1);

test('100 MiB uses SINGLE; 100 MiB + 1 byte uses multipart with 8 MiB parts', () => {
  assert.throws(() => partCount(BigInt(UPLOAD_LIMITS.singlePutLimitBytes)), /outside/i);
  assert.equal(partCount(total), 13);
  assert.equal(expectedPartSize(total, 1), part);
  assert.equal(expectedPartSize(total, 13), Number(total - 12n * BigInt(part)));
  assert.throws(() => expectedPartSize(total, 14), /outside/i);
});

test('S3 part receipts require exact sizes, numbers and server ETags', () => {
  const listed = Array.from({ length: 13 }, (_, index) => ({
    partNumber: index + 1,
    etag: `"etag${index + 1}"`,
    sizeBytes: expectedPartSize(total, index + 1),
  }));
  const submitted = listed.map((entry) => ({ partNumber: entry.partNumber, etag: entry.etag }));
  assert.equal(verifyMultipartReceipts(total, listed, submitted).length, 13);
  assert.throws(
    () => verifyMultipartReceipts(total, listed.slice(1), submitted),
    /not all expected parts/i,
  );
  assert.throws(
    () =>
      verifyMultipartReceipts(
        total,
        listed.map((entry) => ({
          ...entry,
          sizeBytes: entry.partNumber === 1 ? entry.sizeBytes - 1 : entry.sizeBytes,
        })),
        submitted,
      ),
    /differs/i,
  );
  assert.throws(
    () =>
      verifyMultipartReceipts(
        total,
        listed,
        submitted.map((entry) => ({
          ...entry,
          etag: entry.partNumber === 3 ? 'tampered' : entry.etag,
        })),
      ),
    /differs/i,
  );
});
