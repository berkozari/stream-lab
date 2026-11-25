import { VideoTranscodeJobDataSchema, type VideoTranscodeJobData } from '@streamlab/contracts';
import { probeLocalVideo, type VideoProbe } from '../ffprobe/probe.js';
import { downloadVerifiedOriginal, type OriginalSource } from '../storage/original-source.js';

export type SourceProbeDependencies = {
  resolveSource: (job: VideoTranscodeJobData) => Promise<OriginalSource>;
  download: (source: OriginalSource) => Promise<{ filePath: string; cleanup: () => Promise<void> }>;
  probe: (filePath: string) => Promise<VideoProbe>;
};

/** Prep phase only: deliberately does not mutate QUEUED -> PROCESSING or publish HLS. */
export function createProbeTranscodingSource(
  deps: SourceProbeDependencies = {
    resolveSource: async (job) => {
      const { getQueuedTranscodingSource } =
        await import('../../repositories/transcoding-source.repository.js');
      return getQueuedTranscodingSource(job);
    },
    download: downloadVerifiedOriginal,
    probe: probeLocalVideo,
  },
): (job: VideoTranscodeJobData) => Promise<VideoProbe> {
  return async (input) => {
    const job = VideoTranscodeJobDataSchema.parse(input);
    const source = await deps.resolveSource(job);
    const local = await deps.download(source);
    try {
      return await deps.probe(local.filePath);
    } finally {
      await local.cleanup();
    }
  };
}

export const probeTranscodingSource = createProbeTranscodingSource();
