import { VideoResponseSchema, type CreateVideoRequest, type Video } from '@streamlab/contracts';
import { insertVideoDraft, type CreatedVideoRecord } from '../repositories/video.repository.js';

export type VideoDraftWriter = (
  ownerId: string,
  input: CreateVideoRequest,
) => Promise<CreatedVideoRecord>;
export type CreateVideoHandler = (ownerId: string, input: CreateVideoRequest) => Promise<Video>;

/** The shared response schema is the final serialization/field allowlist. */
export function createVideoService(write: VideoDraftWriter = insertVideoDraft): CreateVideoHandler {
  return async (ownerId, input) => {
    const record = await write(ownerId, input);
    return VideoResponseSchema.parse({
      ...record,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  };
}

export const createVideo = createVideoService();
