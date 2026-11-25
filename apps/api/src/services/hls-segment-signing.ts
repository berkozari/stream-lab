/** Bound the amount of concurrent presigning work while preserving playlist order. */
export async function signHlsSegmentUrls(
  keys: readonly string[],
  signer: (key: string) => Promise<string>,
  maxConcurrent = 12,
): Promise<string[]> {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 64) {
    throw new RangeError('Invalid HLS presigning concurrency');
  }
  const urls = new Array<string>(keys.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < keys.length) {
      const index = cursor++;
      const key = keys[index];
      if (key === undefined) throw new Error('Invalid HLS segment key');
      urls[index] = await signer(key);
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, keys.length) }, () => run()));
  return urls;
}
