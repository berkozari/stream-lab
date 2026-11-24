import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const apiBase = 'http://127.0.0.1:4000/api/v1';
const password = 'StreamLabVideoE2E-Secure-2026!';
const accounts: string[] = [];

type Session = { email: string; accessToken: string };

async function register(page: Page): Promise<Session> {
  const email = `streamlab-video-e2e-${randomUUID()}@example.invalid`;
  // Track before registration: cleanup remains safe even after a partial failure.
  accounts.push(email);
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Görünen ad' }).fill('Video E2E User');
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Kayıt ol' }).click();
  const response = await responsePromise;
  expect(
    response.status(),
    `Registration failed (${response.status()}); check auth rate limiting`,
  ).toBe(201);
  const body = (await response.json()) as { data?: { accessToken?: string } };
  const accessToken = body.data?.accessToken;
  if (!accessToken) throw new Error('Register response has no access token');
  await expect(page.getByRole('heading', { name: 'İçerik yönetimi' })).toBeVisible();
  return { email, accessToken };
}

async function createDraft(page: Page, title: string, description = ''): Promise<string> {
  await page.getByRole('button', { name: 'Yeni video' }).click();
  await page.getByLabel('Video başlığı').fill(title);
  await page.getByLabel('Açıklama (isteğe bağlı)').fill(description);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/videos') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Video oluştur' }).click();
  const response = await responsePromise;
  expect(response.status(), `Create Video failed (${response.status()})`).toBe(201);
  const body = (await response.json()) as {
    data: { id: string; status: string; visibility: string };
  };
  expect(body.data.status).toBe('DRAFT');
  expect(body.data.visibility).toBe('PRIVATE');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return body.data.id;
}

// The prefix is checked again by the server-side cleanup script. Never remove arbitrary users.
test.afterEach(() => {
  const failures: string[] = [];
  for (const email of accounts.splice(0)) {
    const result = spawnSync(
      'pnpm',
      ['--filter', '@streamlab/api', 'exec', 'tsx', 'scripts/video-e2e-cleanup.ts', email],
      { cwd: root, encoding: 'utf8', timeout: 45_000 },
    );
    if (result.status !== 0) {
      failures.push(`${email}: ${result.stderr || result.stdout || String(result.error)}`);
    }
  }
  if (failures.length) throw new Error(`Video E2E cleanup failed: ${failures.join('; ')}`);
});

test('video CRUD: creator creates, edits, searches and soft-deletes a private draft', async ({
  page,
}) => {
  const { accessToken } = await register(page);
  const title = `Video E2E ${randomUUID().slice(0, 8)}`;
  const updatedTitle = `${title} updated`;
  const videoId = await createDraft(page, title, 'Initial E2E description');

  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: `${title} videosunu düzenle` }).click();
  await expect(page.getByLabel('Görünürlük')).toBeDisabled();
  await page.getByLabel('Video başlığı').fill(updatedTitle);
  await page.getByLabel('Açıklama (isteğe bağlı)').fill('Updated E2E description');
  const updatePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/videos/${videoId}`) &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  expect((await updatePromise).status()).toBe(200);
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Videolarımda ara' }).fill(updatedTitle);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  await page.getByRole('button', { name: `${updatedTitle} videosunu sil` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(updatedTitle);
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  await page.getByRole('button', { name: `${updatedTitle} videosunu sil` }).click();
  await expect(dialog).toBeVisible();
  const deletePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/videos/${videoId}`) &&
      response.request().method() === 'DELETE',
  );
  await dialog.getByRole('button', { name: 'Evet, sil' }).click();
  expect((await deletePromise).status()).toBe(202);
  await expect(page.getByRole('heading', { name: updatedTitle })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: updatedTitle })).toHaveCount(0);

  const deleted = await page.request.get(`${apiBase}/videos/${videoId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(deleted.status()).toBe(404);
});

test('validation blocks empty create, and cursor pagination fetches the next page', async ({
  page,
}) => {
  const { accessToken } = await register(page);
  let createRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/videos') && request.method() === 'POST')
      createRequests += 1;
  });
  await page.getByRole('button', { name: 'Yeni video' }).click();
  await page.getByRole('button', { name: 'Video oluştur' }).click();
  await expect(page.getByLabel('Video başlığı')).toHaveAttribute('aria-invalid', 'true');
  expect(createRequests).toBe(0);
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  // Seed by authenticated real HTTP requests, not direct DB writes.
  const prefix = `Video page ${randomUUID().slice(0, 8)}`;
  for (let index = 0; index < 13; index += 1) {
    const response = await page.request.post(`${apiBase}/videos`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        title: `${prefix} ${String(index).padStart(2, '0')}`,
        description: null,
        categoryIds: [],
      },
    });
    expect(response.status(), `Seeding draft #${index} failed`).toBe(201);
  }
  await page.reload();
  const list = page.getByRole('list', { name: 'Video listesi' });
  await expect(list.getByRole('listitem')).toHaveCount(12);
  await page.getByRole('button', { name: 'Daha fazla yükle' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(13);
  await page.getByRole('searchbox', { name: 'Videolarımda ara' }).fill(`${prefix} 00`);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
});

test('second user cannot read, update or delete the owner private video', async ({
  page,
  browser,
}) => {
  const owner = await register(page);
  const title = `Private ownership E2E ${randomUUID().slice(0, 8)}`;
  const videoId = await createDraft(page, title);

  const anotherContext = await browser.newContext();
  try {
    const strangerPage = await anotherContext.newPage();
    const stranger = await register(strangerPage);
    const headers = { authorization: `Bearer ${stranger.accessToken}` };
    const detail = await strangerPage.request.get(`${apiBase}/videos/${videoId}`, { headers });
    expect(detail.status()).toBe(404);
    const update = await strangerPage.request.patch(`${apiBase}/videos/${videoId}`, {
      headers,
      data: { title: 'Unauthorized update attempt' },
    });
    expect(update.status()).toBe(404);
    const remove = await strangerPage.request.delete(`${apiBase}/videos/${videoId}`, { headers });
    expect(remove.status()).toBe(404);

    // Attempts from the second account must not mutate the first account's video.
    const original = await page.request.get(`${apiBase}/videos/${videoId}`, {
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(original.status()).toBe(200);
    const body = (await original.json()) as { data: { title: string; status: string } };
    expect(body.data.title).toBe(title);
    expect(body.data.status).toBe('DRAFT');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  } finally {
    await anotherContext.close();
  }
});
