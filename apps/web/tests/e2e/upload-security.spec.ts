import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';

/** STREAM-004.9 — live browser/API/S3 E2E; needs local PostgreSQL, API, web and SILO. */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const api = 'http://127.0.0.1:4000/api/v1';
const password = 'StreamLab-Upload-E2E-2026-Strong!';
const accounts: string[] = [];
const temporaryFiles: string[] = [];
const signature = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const tinyMp4 = Buffer.concat([signature, Buffer.alloc(116)]);
const multipartBytes = 104_857_601;

type Identity = { email: string; accessToken: string };

async function register(page: Page): Promise<Identity> {
  const email = `streamlab-upload-e2e-${randomUUID()}@example.invalid`;
  accounts.push(email); // Record before POST so failed setups can also be cleaned up.
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Görünen ad' }).fill('Upload Security E2E');
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Kayıt ol' }).click();
  const response = await responsePromise;
  expect(response.status(), 'Registration failed; check auth rate limiting').toBe(201);
  const body = (await response.json()) as { data?: { accessToken?: string } };
  const accessToken = body.data?.accessToken;
  if (!accessToken) throw new Error('Registration returned no access token');
  await expect(page.getByRole('heading', { name: 'İçerik yönetimi' })).toBeVisible();
  return { email, accessToken };
}

async function draft(page: Page): Promise<{ videoId: string; title: string }> {
  const title = `Upload E2E ${randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Yeni video' }).click();
  await page.getByLabel('Video başlığı').fill(title);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/videos') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Video oluştur' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data: { id: string; status: string } };
  expect(body.data.status).toBe('DRAFT');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return { videoId: body.data.id, title };
}

async function panel(page: Page, title: string) {
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .getByRole('button', { name: 'Video dosyasını yükle' })
    .click();
  const uploadPanel = page.getByRole('region', { name: `${title} dosya yükleme` });
  await expect(uploadPanel).toBeVisible();
  return uploadPanel;
}

function authHeaders(identity: Identity) {
  return { authorization: `Bearer ${identity.accessToken}` };
}

// This is an E2E test, not a media codec test. STREAM-004.6 only sniffs container signature.
function uploadFile(buffer = tinyMp4): string {
  // An on-disk fixture keeps File.lastModified identical after reload/reselect.
  const directory = mkdtempSync(join(tmpdir(), 'streamlab-upload-e2e-'));
  temporaryFiles.push(directory);
  const path = join(directory, 'upload-e2e.mp4');
  writeFileSync(path, buffer);
  return path;
}

// STREAM-004.9: two real registrations shared across tests; auth rate limits remain enabled.
type UploadUsers = { owner: Identity; outsider: Identity; ownerContext: BrowserContext };
type UploadFixtures = { owner: Identity; outsider: Identity };
type UploadWorkerFixtures = { uploadUsers: UploadUsers };

function cleanupAccounts(): void {
  const errors: string[] = [];
  for (const email of accounts.splice(0)) {
    const result = spawnSync(
      'pnpm',
      ['--filter', '@streamlab/api', 'exec', 'tsx', 'scripts/upload-e2e-cleanup.ts', email],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 90_000,
      },
    );
    if (result.status !== 0) {
      errors.push(`${email}: ${result.stderr || result.stdout || String(result.error)}`);
    }
  }
  if (errors.length) throw new Error(`Upload E2E account cleanup failed: ${errors.join('; ')}`);
}

const test = base.extend<UploadFixtures, UploadWorkerFixtures>({
  uploadUsers: [
    async ({ browser }, provide) => {
      const ownerContext = await browser.newContext({
        baseURL: 'http://127.0.0.1:5173',
      });

      const outsiderContext = await browser.newContext({
        baseURL: 'http://127.0.0.1:5173',
      });

      try {
        const ownerPage = await ownerContext.newPage();
        const owner = await register(ownerPage);
        await ownerPage.close();

        const outsiderPage = await outsiderContext.newPage();
        const outsider = await register(outsiderPage);
        await outsiderPage.close();

        await provide({ owner, outsider, ownerContext });
      } finally {
        try {
          await ownerContext.close();
          await outsiderContext.close();
        } finally {
          cleanupAccounts();
        }
      }
    },
    { scope: 'worker' },
  ],

  owner: async ({ uploadUsers }, provide) => {
    await provide(uploadUsers.owner);
  },

  outsider: async ({ uploadUsers }, provide) => {
    await provide(uploadUsers.outsider);
  },

  page: async ({ uploadUsers }, provide) => {
    const page = await uploadUsers.ownerContext.newPage();

    try {
      await page.goto('/creator');

      await expect(page.getByRole('heading', { name: 'İçerik yönetimi' })).toBeVisible();

      await provide(page);
    } finally {
      await page.close();
    }
  },
});

test.afterEach(() => {
  const errors: string[] = [];
  for (const directory of temporaryFiles.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      errors.push(`temporary file: ${String(error)}`);
    }
  }
  if (errors.length) throw new Error(`Upload E2E cleanup failed: ${errors.join('; ')}`);
});

test('single PUT: real browser sends bytes to S3, then backend verifies the original', async ({
  page,
  owner,
}) => {
  const { videoId, title } = await draft(page);
  const uploadPanel = await panel(page, title);
  await uploadPanel.getByLabel('Video dosyası').setInputFiles(uploadFile());

  let sawUnsignedS3Request = false;
  const unexpectedHeaders: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'PUT' || request.url().includes('/api/v1/')) return;
    sawUnsignedS3Request = true;
    const headers = request.headers();
    for (const key of ['authorization', 'cookie', 'x-csrf-token', 'x-xsrf-token']) {
      if (headers[key]) unexpectedHeaders.push(key);
    }
  });

  const completion = page.waitForResponse(
    (response) =>
      /\/api\/v1\/uploads\/[0-9a-f-]+\/complete$/u.test(response.url()) &&
      response.request().method() === 'POST',
  );
  await uploadPanel.getByRole('button', { name: 'Yüklemeyi başlat' }).click();
  const response = await completion;
  expect(response.status(), `Completion failed with ${response.status()}`).toBe(200);
  await expect(uploadPanel).toHaveCount(0);
  expect(sawUnsignedS3Request).toBe(true);
  expect(unexpectedHeaders).toEqual([]);

  const video = await page.request.get(`${api}/videos/${videoId}`, { headers: authHeaders(owner) });
  expect(video.status()).toBe(200);
  const body = (await video.json()) as { data: { id: string; status: string } };
  expect(body.data.id).toBe(videoId);
  expect(body.data.status).toBe('UPLOADED');
});

test('anonymous and second user cannot sign or complete owner upload', async ({
  page,
  browser,
  owner,
  outsider,
}) => {
  const { videoId } = await draft(page);
  const session = await page.request.post(`${api}/videos/${videoId}/uploads`, {
    headers: authHeaders(owner),
    data: {
      fileName: 'upload-e2e.mp4',
      contentType: 'video/mp4',
      sizeBytes: String(tinyMp4.length),
    },
  });
  expect(session.status()).toBe(201);
  const body = (await session.json()) as { data: { uploadId: string } };
  const uploadId = body.data.uploadId;
  expect(uploadId).toMatch(/^[0-9a-f-]{36}$/u);

  const outsiderContext = await browser.newContext();
  try {
    const outsiderPage = await outsiderContext.newPage();
    const signPath = `${api}/uploads/${uploadId}/sign`;
    const completePath = `${api}/uploads/${uploadId}/complete`;
    const signBody = { contentType: 'video/mp4' };
    expect((await page.request.post(signPath, { data: signBody })).status()).toBe(401);
    expect(
      (
        await outsiderPage.request.post(signPath, {
          headers: authHeaders(outsider),
          data: signBody,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await outsiderPage.request.post(completePath, { headers: authHeaders(outsider), data: {} })
      ).status(),
    ).toBe(404);
    // An unauthorized caller must not change the legitimate owner's upload state.
    const allowed = await page.request.post(signPath, {
      headers: authHeaders(owner),
      data: signBody,
    });
    expect(allowed.status()).toBe(200);
    const result = (await allowed.json()) as { data?: { uploadUrl?: string } };
    expect(result.data?.uploadUrl).toBeTruthy();
  } finally {
    await outsiderContext.close();
  }
});

test('invalid file stays in browser: no upload session is created', async ({ page }) => {
  const { title } = await draft(page);
  const uploadPanel = await panel(page, title);
  let createRequests = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/v1\/videos\/[0-9a-f-]+\/uploads(?:\/multipart)?$/u.test(request.url())
    ) {
      createRequests += 1;
    }
  });
  await uploadPanel.getByLabel('Video dosyası').setInputFiles({
    name: 'unsafe.avi',
    mimeType: 'video/x-msvideo',
    buffer: Buffer.alloc(32),
  });
  await uploadPanel.getByRole('button', { name: 'Yüklemeyi başlat' }).click();
  await expect(uploadPanel.getByRole('alert')).toContainText('MP4 veya WebM');
  expect(createRequests).toBe(0);
});

test('single PUT: an interrupted browser upload can resume without creating a second session', async ({
  page,
}) => {
  const { title } = await draft(page);
  const uploadPanel = await panel(page, title);
  const uploadPath = uploadFile();
  await uploadPanel.getByLabel('Video dosyası').setInputFiles(uploadPath);
  let createRequests = 0;
  let failedPut = false;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/v1\/videos\/[0-9a-f-]+\/uploads$/u.test(request.url())
    )
      createRequests += 1;
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!failedPut && request.method() === 'PUT' && !request.url().includes('/api/v1/')) {
      failedPut = true;
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await uploadPanel.getByRole('button', { name: 'Yüklemeyi başlat' }).click();
  await expect(uploadPanel.getByRole('alert')).toBeVisible();
  expect(failedPut).toBe(true);
  expect(createRequests).toBe(1);
  await page.reload();
  const resumed = await panel(page, title);
  await resumed.getByLabel('Video dosyası').setInputFiles(uploadPath);
  const completion = page.waitForResponse(
    (response) =>
      /\/api\/v1\/uploads\/[0-9a-f-]+\/complete$/u.test(response.url()) &&
      response.request().method() === 'POST',
  );
  await resumed.getByRole('button', { name: 'Yüklemeye devam et' }).click();
  expect((await completion).status()).toBe(200);
  await expect(resumed).toHaveCount(0);
  expect(createRequests).toBe(1);
});

test('multipart: browser interruption, reload, resume and S3 verification (>100 MiB)', async ({
  page,
  owner,
}) => {
  test.skip(
    process.env.STREAMLAB_E2E_LARGE_UPLOAD !== '1',
    'Run explicitly with pnpm test:upload:e2e:large',
  );
  test.setTimeout(600_000);
  const { title, videoId } = await draft(page);
  const bytes = Buffer.alloc(multipartBytes);
  signature.copy(bytes);
  const uploadPanel = await panel(page, title);
  const uploadPath = uploadFile(bytes);
  await uploadPanel.getByLabel('Video dosyası').setInputFiles(uploadPath);
  let putCount = 0;
  let abortedPutAttempts = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && !request.url().includes('/api/v1/')) putCount += 1;
  });
  // Allow the first 8-MiB part to upload, force the second part's three
  // retries to fail, then reload and reselect the identical local file.
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (
      request.method() === 'PUT' &&
      !request.url().includes('/api/v1/') &&
      putCount >= 2 &&
      abortedPutAttempts < 3
    ) {
      abortedPutAttempts += 1;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await uploadPanel.getByRole('button', { name: 'Yüklemeyi başlat' }).click();
  await expect(uploadPanel.getByRole('alert')).toBeVisible({ timeout: 120_000 });
  expect(abortedPutAttempts).toBe(3);
  await page.reload();
  const resumed = await panel(page, title);
  await resumed.getByLabel('Video dosyası').setInputFiles(uploadPath);
  const completion = page.waitForResponse(
    (response) =>
      /\/api\/v1\/uploads\/[0-9a-f-]+\/multipart\/complete$/u.test(response.url()) &&
      response.request().method() === 'POST',
    { timeout: 550_000 },
  );
  await resumed.getByRole('button', { name: 'Yüklemeye devam et' }).click();
  const response = await completion;
  expect(response.status()).toBe(200);
  expect(putCount).toBeGreaterThanOrEqual(14);
  await expect(resumed).toHaveCount(0);
  const video = await page.request.get(`${api}/videos/${videoId}`, { headers: authHeaders(owner) });
  expect(((await video.json()) as { data: { status: string } }).data.status).toBe('UPLOADED');
});
