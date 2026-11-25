import type { VideoTranscodeJobData } from '@streamlab/contracts';
import { stageTranscodingAttempt } from '../repositories/video-transcode-outbox.repository.js';

export type TranscodingAttemptStager = (videoId: string) => Promise<VideoTranscodeJobData>;

/** Explicit staging for manually prepared videos; upload completion stages atomically. */
export function createStageVideoForTranscoding(
  stage: TranscodingAttemptStager = stageTranscodingAttempt,
): TranscodingAttemptStager {
  return (videoId) => stage(videoId);
}

export const stageVideoForTranscoding = createStageVideoForTranscoding();
