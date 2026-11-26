import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * STREAM-007.6 live browser checks against the existing development environment.
 * Each test has an isolated browser context. Signed media URLs and credentials
 * are never printed by these tests.
 */
const email = process.env.STREAMLAB_E2E_PLAYBACK_EMAIL?.trim();
const password = process.env.STREAMLAB_E2E_PLAYBACK_PASSWORD;
const readyVideoId = process.env.STREAMLAB_E2E_PLAYBACK_VIDEO_ID?.trim();
const allowWrite = process.env.STREAMLAB_E2E_WATCH_WRITE === '1';

async function login(page: Page): Promise<void> {
  if (!email || !password) {
    throw new Error('Set both STREAMLAB_E2E_PLAYBACK_EMAIL and STREAMLAB_E2E_PLAYBACK_PASSWORD');
  }
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'İçerik yönetimi' })).toBeVisible({
    timeout: 30_000,
  });
}

function isProgressResponse(response: Response, method: 'GET' | 'PUT', id: string): boolean {
  return (
    response.request().method() === method &&
    response.status() === 200 &&
    new URL(response.url()).pathname.endsWith(`/api/v1/users/me/watch-progress/${id}`)
  );
}

test('[public] discovery search, categories and history navigation stay synchronized', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Videoları keşfet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Videolar', exact: true })).toBeVisible();

  const category = page.locator('#discovery-category');

  await expect(category).toBeVisible();
  await expect
    .poll(() => category.locator('option').count(), {
      timeout: 15_000,
      message: 'Category seed/API has no available category options',
    })
    .toBeGreaterThan(1);
  const firstCategorySlug = await category.locator('option').nth(1).getAttribute('value');
  if (!firstCategorySlug) throw new Error('First category is missing its slug');
  await category.selectOption(firstCategorySlug);
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBe(firstCategorySlug);

  const unlikelyTerm = `streamlab-e2e-no-match-${Date.now()}`;
  await page.getByRole('searchbox', { name: 'Video ara' }).fill(unlikelyTerm);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(unlikelyTerm);
  await expect(page.getByText('Bu filtrelerle eşleşen yayınlanmış video bulunamadı.')).toBeVisible({
    timeout: 15_000,
  });

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBe(firstCategorySlug);
  await expect(category).toHaveValue(firstCategorySlug);
});

test('[public] unauthenticated viewer cannot open personal history pages', async ({ page }) => {
  for (const path of ['/history', '/continue-watching']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/u, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
  }
});

test('[auth] history and continue lists load for the signed-in viewer', async ({ page }) => {
  if (!email || !password) {
    test.skip(true, 'Authenticated run requires the playback E2E test account');
    return;
  }
  await login(page);
  const historyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.status() === 200 &&
      new URL(response.url()).pathname.endsWith('/api/v1/users/me/watch-history'),
  );
  await page.goto('/history');
  await historyResponse;
  await expect(page.getByRole('heading', { name: 'İzleme geçmişim' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('İzleme kayıtları yükleniyor…')).toHaveCount(0, { timeout: 20_000 });
  const continueResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.status() === 200 &&
      new URL(response.url()).pathname.endsWith('/api/v1/users/me/continue-watching'),
  );
  await page.goto('/continue-watching');
  await continueResponse;
  await expect(page.getByRole('heading', { name: 'İzlemeye devam et' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('İzleme kayıtları yükleniyor…')).toHaveCount(0, { timeout: 20_000 });
});

test('[auth] seek persists, history/continue update and video resumes at saved position', async ({
  page,
}) => {
  if (!email || !password || !readyVideoId || !allowWrite) {
    test.skip(
      true,
      'Opt in with credentials, existing READY video ID and STREAMLAB_E2E_WATCH_WRITE=1',
    );
    return;
  }
  test.setTimeout(130_000);
  await login(page);
  await page.goto(`/watch/${readyVideoId}`);
  const video = page.locator('video');
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => video.evaluate((media: HTMLVideoElement) => media.duration), { timeout: 45_000 })
    .toBeGreaterThan(90);
  const seconds = await video.evaluate((media: HTMLVideoElement) =>
    Math.min(35, Math.floor(media.duration * 0.35)),
  );
  if (seconds < 15) throw new Error('A READY fixture of at least 90 seconds is required');

  const updated = page.waitForResponse(
    (response) => {
      if (!isProgressResponse(response, 'PUT', readyVideoId)) return false;
      try {
        const body = response.request().postDataJSON() as { positionSeconds?: number };
        return (body.positionSeconds ?? 0) >= seconds - 3;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
  await video.evaluate((media: HTMLVideoElement, target) => {
    media.pause();
    media.currentTime = target;
  }, seconds);
  await updated;

  await page.goto('/history');
  await expect(page.locator(`a[href="/watch/${readyVideoId}"]`)).toBeVisible({ timeout: 20_000 });
  await page.goto('/continue-watching');
  await expect(page.locator(`a[href="/watch/${readyVideoId}"]`)).toBeVisible({ timeout: 20_000 });

  const readProgress = page.waitForResponse(
    (response) => isProgressResponse(response, 'GET', readyVideoId),
    {
      timeout: 30_000,
    },
  );
  await page.goto(`/watch/${readyVideoId}`);
  const response = await readProgress;
  const result = (await response.json()) as { data?: { positionSeconds?: number } };
  expect(result.data?.positionSeconds).toBeGreaterThanOrEqual(seconds - 3);
  await expect
    .poll(() => page.locator('video').evaluate((media: HTMLVideoElement) => media.currentTime), {
      timeout: 45_000,
      message: 'Player did not restore persisted watch position',
    })
    .toBeGreaterThanOrEqual(seconds - 3);
  const currentTime = await page
    .locator('video')
    .evaluate((media: HTMLVideoElement) => media.currentTime);
  expect(currentTime).toBeLessThan(seconds + 6);
});
