import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

/**
 * Tests use an existing READY fixture; they never upload/delete media or log signed URLs.
 * The runner requires STREAMLAB_E2E_PLAYBACK_VIDEO_ID for real playback checks.
 */
const readyId = process.env.STREAMLAB_E2E_PLAYBACK_VIDEO_ID?.trim();
const abrId = process.env.STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID?.trim();
const email = process.env.STREAMLAB_E2E_PLAYBACK_EMAIL?.trim();
const password = process.env.STREAMLAB_E2E_PLAYBACK_PASSWORD;
const renewalEnabled = process.env.STREAMLAB_E2E_PLAYBACK_RENEWAL === '1';

async function loginIfRequired(page: Page): Promise<void> {
  if (!email && !password) return;
  if (!email || !password) {
    throw new Error('Set both STREAMLAB_E2E_PLAYBACK_EMAIL and STREAMLAB_E2E_PLAYBACK_PASSWORD');
  }
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'İçerik yönetimi' })).toBeVisible();
}

async function openReadyVideo(page: Page, id: string): Promise<void> {
  await loginIfRequired(page);
  await page.goto(`/watch/${id}`);
  await expect(page.locator('video')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), {
      timeout: 90_000,
      message: 'Player did not load playable media metadata/data',
    })
    .toBeGreaterThanOrEqual(2);
}

test('unknown video cannot be watched', async ({ page }) => {
  await page.goto(`/watch/${randomUUID()}`);
  await expect(page.getByRole('alert')).toContainText('Video bulunamadı', { timeout: 30_000 });
  await expect(page.locator('video')).toHaveCount(0);
});

test('READY video plays HLS and fetches a segment directly from storage', async ({ page }) => {
  if (!readyId) {
    test.skip(true, 'Provide STREAMLAB_E2E_PLAYBACK_VIDEO_ID (existing READY video)');
    return;
  }
  const segmentResponses: Array<{ status: number; path: string; redirected: boolean }> = [];
  const failedMedia: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (!/\.m3u8$|\/segment_\d+\.ts$/u.test(path)) return;
    if (response.status() >= 400) failedMedia.push(`${response.status()} for media resource`);
    if (/\/segment_\d+\.ts$/u.test(path)) {
      segmentResponses.push({
        status: response.status(),
        path,
        redirected: path.includes('/playback/hls/'),
      });
    }
  });

  await openReadyVideo(page, readyId);
  const player = page.locator('video');
  await player.evaluate(async (video: HTMLVideoElement) => {
    video.muted = true; // Avoid autoplay-policy failures in headless Chromium.
    await video.play();
  });
  await expect
    .poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0.2);
  await expect
    .poll(() => segmentResponses.some((response) => response.status === 200), {
      timeout: 30_000,
    })
    .toBe(true);
  expect(segmentResponses.some((response) => response.redirected)).toBe(false);
  expect(failedMedia).toEqual([]);
  await player.evaluate((video: HTMLVideoElement) => video.pause());
  expect(new URL(page.url()).searchParams.has('token')).toBe(false);
});

test('ABR fixture supports manual quality and returning to automatic mode', async ({ page }) => {
  if (!abrId) {
    test.skip(true, 'Provide STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID (READY, 2+ renditions)');
    return;
  }
  await openReadyVideo(page, abrId);
  const select = page.getByLabel('Görüntü kalitesi');
  await expect(select).toBeVisible({ timeout: 30_000 });
  const options = await select.locator('option').all();
  expect(options.length).toBeGreaterThan(2); // Auto + at least two renditions
  const manualValue = await options[1]?.getAttribute('value');
  if (!manualValue) throw new Error('Quality fixture has no manual option');
  const before = await page
    .locator('video')
    .evaluate((video: HTMLVideoElement) => video.currentTime);
  await select.selectOption(manualValue);
  await expect(select).toHaveValue(manualValue);
  await expect(page.getByText(/Seçilen:/u)).toBeVisible();
  const after = await page
    .locator('video')
    .evaluate((video: HTMLVideoElement) => video.currentTime);
  expect(Math.abs(after - before)).toBeLessThan(5);
  await select.selectOption('-1');
  await expect(select).toHaveValue('-1');
});

test('playback capability renews before expiry without resetting the playhead', async ({
  page,
}) => {
  if (!renewalEnabled || !readyId) {
    test.skip(true, 'Opt-in: TTL 60s API + PLAYBACK_RENEWAL=1 + long READY video');
    return;
  }
  test.setTimeout(125_000);
  let playbackResponses = 0;
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (/\/api\/v1\/videos\/[^/]+\/playback$/u.test(path) && response.status() === 200) {
      playbackResponses += 1;
    }
  });
  await openReadyVideo(page, readyId);
  const player = page.locator('video');
  await player.evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await video.play();
  });
  await expect.poll(() => playbackResponses, { timeout: 90_000 }).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 20_000,
    })
    .toBeGreaterThan(3);
  expect(await player.evaluate((video: HTMLVideoElement) => video.error?.code ?? null)).toBeNull();
});
