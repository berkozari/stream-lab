import type { UpdateVideoRequest, Video } from '@streamlab/contracts';
import type { CreatedVideoRecord } from '../repositories/video.repository.js';
import { updateOwnedVideoMetadata } from '../repositories/video-update.repository.js';
import { serializeVideo } from './video-read.service.js';

export type VideoMetadataWriter = (
  videoId: string,
  ownerId: string,
  input: UpdateVideoRequest,
) => Promise<CreatedVideoRecord>;
export type UpdateVideoHandler = (
  videoId: string,
  ownerId: string,
  input: UpdateVideoRequest,
) => Promise<Video>;

/** Never accept ownerId from the HTTP body; response is the shared public allowlist. */
export function createUpdateVideoService(
  write: VideoMetadataWriter = updateOwnedVideoMetadata,
): UpdateVideoHandler {
  return async (videoId, ownerId, input) => serializeVideo(await write(videoId, ownerId, input));
}

export const updateVideo = createUpdateVideoService();
