/** Poll only while a video is waiting for or undergoing transcoding. */
export function videoStatusRefetchInterval(status: string | null | undefined): number | false {
  return status === 'QUEUED' || status === 'PROCESSING' ? 5_000 : false;
}
