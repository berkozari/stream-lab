import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIDEO_TRANSCODE_JOB_NAME,
  VideoTranscodeJobDataSchema,
  getVideoTranscodeJobId,
} from '../dist/index.js';

const videoId = '123e4567-e89b-42d3-a456-426614174000';
const jobData = { contractVersion: 1, videoId, processingVersion: 1 };

test('real transcoding job has a stable name and a minimal valid payload', () => {
  assert.equal(VIDEO_TRANSCODE_JOB_NAME, 'video.transcode');
  assert.deepEqual(VideoTranscodeJobDataSchema.parse(jobData), jobData);
});

test('contract rejects unknown fields such as storage credentials or object keys', () => {
  assert.equal(
    VideoTranscodeJobDataSchema.safeParse({ ...jobData, storageKey: 'secret' }).success,
    false,
  );
  assert.equal(
    VideoTranscodeJobDataSchema.safeParse({ ...jobData, accessKeyId: 'secret' }).success,
    false,
  );
});

test('contract rejects bad identifiers, unsupported versions and invalid attempt numbers', () => {
  assert.equal(
    VideoTranscodeJobDataSchema.safeParse({ ...jobData, videoId: '../file' }).success,
    false,
  );
  assert.equal(
    VideoTranscodeJobDataSchema.safeParse({ ...jobData, contractVersion: 2 }).success,
    false,
  );
  assert.equal(
    VideoTranscodeJobDataSchema.safeParse({ ...jobData, processingVersion: 0 }).success,
    false,
  );
  assert.equal(
    VideoTranscodeJobDataSchema.safeParse({ ...jobData, processingVersion: 1.5 }).success,
    false,
  );
});

test('job IDs are stable per video and processing version', () => {
  const id = getVideoTranscodeJobId(jobData);
  assert.equal(id, `transcode-${videoId}-1`);
  assert.equal(getVideoTranscodeJobId({ ...jobData }), id);
  assert.notEqual(getVideoTranscodeJobId({ ...jobData, processingVersion: 2 }), id);
  assert.equal(id.includes(':'), false);
});
