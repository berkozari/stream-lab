import type { CreateVideoRequest, Video } from '@streamlab/contracts';
import { insertVideoDraft, type CreatedVideoRecord } from '../repositories/video.repository.js';
import { serializeVideo } from './video-read.service.js';

export type VideoDraftWriter = (
  ownerId: string,
  input: CreateVideoRequest,
) => Promise<CreatedVideoRecord>;
export type CreateVideoHandler = (ownerId: string, input: CreateVideoRequest) => Promise<Video>;

/** The shared response schema is the final serialization/field allowlist. */
export function createVideoService(write: VideoDraftWriter = insertVideoDraft): CreateVideoHandler {
  return async (ownerId, input) => {
    return serializeVideo(await write(ownerId, input));
  };
}

export const createVideo = createVideoService();
