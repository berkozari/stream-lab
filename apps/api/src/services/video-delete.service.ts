import { softDeleteOwnedVideo } from '../repositories/video-delete.repository.js';

export type VideoDeleter = (videoId: string, ownerId: string) => Promise<void>;
export type DeleteVideoHandler = (
  videoId: string,
  ownerId: string,
) => Promise<{ status: 'DELETING' }>;

/** Authenticated owner identity is always supplied by middleware, not the client. */
export function createDeleteVideoService(
  remove: VideoDeleter = softDeleteOwnedVideo,
): DeleteVideoHandler {
  return async (videoId, ownerId) => {
    await remove(videoId, ownerId);
    return { status: 'DELETING' };
  };
}

export const deleteVideo = createDeleteVideoService();
