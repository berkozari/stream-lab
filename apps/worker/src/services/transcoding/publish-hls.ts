import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VideoTranscodeJobData } from '@streamlab/contracts';
import type { OriginalSource } from '../storage/original-source.js';
import { downloadVerifiedOriginal } from '../storage/original-source.js';
import { probeLocalVideo, type VideoProbe } from '../ffprobe/probe.js';
import { encodeHlsVideo, type HlsEncodingResult } from './ffmpeg-hls.js';
import { uploadHlsOutput, type UploadedHls } from '../storage/hls-objects.js';
import type { PublishReadyInput } from '../../repositories/transcoding-publish.repository.js';
import { assertSourceScratchCapacity, assertTranscodingResources } from './resource-budget.js';
import type { PublishHls } from '../../processors/video-transcode.processor.js';

export type PublishHlsDependencies = {
  resolve: (job: VideoTranscodeJobData, token: string) => Promise<OriginalSource>;
  download: typeof downloadVerifiedOriginal;
  probe: (path: string, signal: AbortSignal) => Promise<VideoProbe>;
  encode: (
    path: string,
    dir: string,
    probe: VideoProbe,
    signal: AbortSignal,
  ) => Promise<HlsEncodingResult>;
  upload: (
    job: VideoTranscodeJobData,
    token: string,
    files: HlsEncodingResult['files'],
    signal: AbortSignal,
  ) => Promise<UploadedHls>;
  commit: (input: PublishReadyInput) => Promise<void>;
  /** Optional to preserve injected test/fixture contracts. */
  admitSource?: (sourceBytes: bigint, signal: AbortSignal) => Promise<void>;
  admitEncode?: (probe: VideoProbe, signal: AbortSignal) => Promise<void>;
};

export function createPublishHls(
  deps: PublishHlsDependencies = {
    resolve: async (job, token) =>
      (
        await import('../../repositories/transcoding-source.repository.js')
      ).getClaimedTranscodingSource(job, token),
    download: downloadVerifiedOriginal,
    probe: (path, signal) => probeLocalVideo(path, process.env.FFPROBE_PATH ?? 'ffprobe', signal),
    encode: encodeHlsVideo,
    upload: uploadHlsOutput,
    admitSource: assertSourceScratchCapacity,
    admitEncode: assertTranscodingResources,
    commit: async (input) =>
      (await import('../../repositories/transcoding-publish.repository.js')).commitTranscodingReady(
        input,
      ),
  },
): PublishHls {
  return async ({ job, claimToken, signal, beforeReadyCommit }) => {
    if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
    const source = await deps.resolve(job, claimToken);
    await deps.admitSource?.(source.sizeBytes, signal);
    if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
    const local = await deps.download(source, { signal });
    let outputDir: string | undefined;
    let uploaded: UploadedHls | undefined;
    let committed = false;
    try {
      const probe = await deps.probe(local.filePath, signal);
      await deps.admitEncode?.(probe, signal);
      if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
      outputDir = await mkdtemp(join(tmpdir(), 'streamlab-hls-'));
      const encoded = await deps.encode(local.filePath, outputDir, probe, signal);
      if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
      uploaded = await deps.upload(job, claimToken, encoded.files, signal);
      // Stop and drain heartbeat before transitioning to READY: a post-commit
      // renewal could otherwise treat a successfully finished job as lease loss.
      await beforeReadyCommit();
      if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
      const master = encoded.files.find((file) => file.relativePath === 'master.m3u8');
      if (!master) throw new Error('HLS_MASTER_MISSING');
      await deps.commit({
        job,
        claimToken,
        durationSeconds: probe.durationSeconds,
        masterKey: uploaded.masterKey,
        masterSizeBytes: master.sizeBytes,
        profiles: encoded.profiles,
        keyFor: uploaded.keyFor,
      });
      committed = true;
    } catch (error) {
      if (uploaded && !committed) {
        try {
          await uploaded.cleanup();
        } catch {
          console.warn('[worker] HLS cleanup failed after publish error');
        }
      }
      throw error;
    } finally {
      try {
        await local.cleanup();
      } catch {
        console.warn('[worker] local original cleanup failed');
      }
      if (outputDir) {
        try {
          await rm(outputDir, { recursive: true, force: true });
        } catch {
          console.warn('[worker] local HLS cleanup failed');
        }
      }
    }
  };
}

export const publishHls = createPublishHls();
