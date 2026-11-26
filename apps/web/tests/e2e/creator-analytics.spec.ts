import { expect, test, type Page, type Response } from '@playwright/test';

/** Live E2E: no signed URLs, access JWTs, cookies or request bodies are logged. */
const email = process.env.STREAMLAB_E2E_PLAYBACK_EMAIL?.trim();
const password = process.env.STREAMLAB_E2E_PLAYBACK_PASSWORD;
const videoId = process.env.STREAMLAB_E2E_ANALYTICS_VIDEO_ID?.trim();
const writeEnabled = process.env.STREAMLAB_E2E_ANALYTICS_WRITE === '1';

async function login(page: Page): Promise<void> {
  if (!email || !password) throw new Error('Set playback E2E email and password');
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'İçerik yönetimi' })).toBeVisible({
    timeout: 30_000,
  });
}

function isOverview(response: Response, range: string): boolean {
  const uri = new URL(response.url());
  return (
    response.request().method() === 'GET' &&
    response.status() === 200 &&
    uri.pathname.endsWith('/api/v1/creator/analytics') &&
    uri.searchParams.get('range') === range
  );
}
function isDetail(response: Response, range: string): boolean {
  const uri = new URL(response.url());
  return (
    response.request().method() === 'GET' &&
    response.status() === 200 &&
    /^\/api\/v1\/creator\/videos\/[0-9a-f-]{36}\/analytics$/u.test(uri.pathname) &&
    uri.searchParams.get('range') === range
  );
}
async function overviewCounts(
  response: Response,
): Promise<{ qualifiedViews: number; watchSeconds: number }> {
  const result = (await response.json()) as {
    data?: { qualifiedViews?: number; watchSeconds?: number };
  };
  expect(result.data?.qualifiedViews).toEqual(expect.any(Number));
  expect(result.data?.watchSeconds).toEqual(expect.any(Number));
  return result.data as { qualifiedViews: number; watchSeconds: number };
}

test('[public] creator analytics is protected for anonymous visitors', async ({ page }) => {
  await page.goto('/creator');
  await expect(page).toHaveURL(/\/login(?:\?|$)/u, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
});

test('[auth] creator overview returns owner-scoped KPIs for all three ranges', async ({ page }) => {
  const firstOverview = page
    .waitForResponse((response) => isOverview(response, '7d'))
    .then(overviewCounts);
  await login(page);
  await firstOverview;
  await expect(page.getByRole('region', { name: 'Video performans analitiği' })).toBeVisible();
  const selector = page.locator('#creator-analytics-range');
  await expect(selector).toHaveValue('7d');
  for (const range of ['30d', 'all']) {
    const reply = page.waitForResponse((response) => isOverview(response, range));
    await selector.selectOption(range);
    const data = await overviewCounts(await reply);
    expect(data.qualifiedViews).toBeGreaterThanOrEqual(0);
  }
});

test('[auth] owner can inspect a selected video, date ranges and UTC trend', async ({ page }) => {
  await login(page);
  const open = page.getByRole('button', { name: /videosunun analitiğini görüntüle/u }).first();
  await expect(open).toBeVisible({ timeout: 30_000 });
  const firstDetail = page.waitForResponse((response) => isDetail(response, '7d'));
  await open.click();
  const response = await firstDetail;
  const result = (await response.json()) as { data: { videoId: string; daily: unknown[] } };
  expect(result.data.daily.length).toBeGreaterThanOrEqual(7);
  await expect(page.getByRole('region', { name: 'Seçili video analitiği' })).toBeVisible();
  const selector = page.locator('#creator-analytics-range');
  for (const [range, hasDaily] of [
    ['30d', true],
    ['all', false],
  ] as const) {
    const reply = page.waitForResponse((res) => isDetail(res, range));
    await selector.selectOption(range);
    const payload = (await (await reply).json()) as { data: { daily: unknown[] } };
    expect(payload.data.daily.length > 0).toBe(hasDaily);
  }
  await page.getByRole('button', { name: 'Kapat', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Seçili video analitiği' })).toHaveCount(0);
});

test('[write] real playback qualifies a fresh session and increases creator totals', async ({
  page,
}) => {
  if (!email || !password || !videoId || !writeEnabled) {
    throw new Error(
      'Run with --full, a creator-owned READY video and explicit analytics write consent',
    );
  }
  test.setTimeout(135_000);
  await login(page);
  const range = page.locator('#creator-analytics-range');
  const beforeReply = page.waitForResponse((response) => isOverview(response, 'all'));
  await range.selectOption('all');
  const before = await overviewCounts(await beforeReply);

  const qualifiedReply = page.waitForResponse(
    async (response) => {
      if (
        response.request().method() !== 'POST' ||
        response.status() !== 200 ||
        !new URL(response.url()).pathname.endsWith(`/api/v1/videos/${videoId}/analytics/events`)
      )
        return false;
      try {
        const payload = (await response.json()) as {
          data?: { qualifiedView?: boolean; watchedSeconds?: number };
        };
        return payload.data?.qualifiedView === true && (payload.data?.watchedSeconds ?? 0) >= 3;
      } catch {
        return false;
      }
    },
    { timeout: 90_000 },
  );
  await page.goto(`/watch/${videoId}`);
  const media = page.locator('video');
  await expect(media).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => media.evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 45_000 })
    .toBeGreaterThan(1);
  await media.evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await video.play();
  });
  await qualifiedReply;

  const afterReply = page.waitForResponse((response) => isOverview(response, 'all'));
  await page.goto('/creator');
  await page.locator('#creator-analytics-range').selectOption('all');
  const after = await overviewCounts(await afterReply);
  expect(after.qualifiedViews).toBeGreaterThanOrEqual(before.qualifiedViews + 1);
  expect(after.watchSeconds).toBeGreaterThanOrEqual(before.watchSeconds + 3);
});
