/**
 * STREAM-004.8 — Browser upload coordinator, independent of React/HTTP implementation.
 * Persistence contains owner-scoped IDs and fingerprints, never storage URLs or credentials.
 * Progress is transport progress; "completed" is emitted only after server verification.
 */
export const SINGLE_PUT_MAX_BYTES = 104_857_600;
export const MAX_UPLOAD_BYTES = 2_147_483_648;
export const MULTIPART_PART_BYTES = 8_388_608;

export type UploadMode = 'SINGLE' | 'MULTIPART';
export type UploadFile = Blob & { name: string; lastModified: number };
export type UploadReceipt = { partNumber: number; etag: string; sizeBytes: number };
export type UploadSession = {
  version: 1;
  ownerId: string;
  videoId: string;
  uploadId: string;
  mode: UploadMode;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  lastModified: number;
  expiresAt: string;
  partSizeBytes: number;
  /** Hash and ETag together prevent accidentally reusing a different file's uploaded part. */
  partDigests: Record<string, string>;
  partEtags: Record<string, string>;
};
export type SignedPut = {
  uploadUrl: string;
  headers: Record<string, string>;
  method: 'PUT';
};
export type UploadGateway = {
  createSingle(videoId: string, file: UploadFile): Promise<{ uploadId: string; expiresAt: string }>;
  signSingle(uploadId: string, contentType: string): Promise<SignedPut>;
  createMultipart(
    videoId: string,
    file: UploadFile,
  ): Promise<{ uploadId: string; expiresAt: string; partSizeBytes: number }>;
  signPart(uploadId: string, partNumber: number): Promise<SignedPut>;
  listParts(
    uploadId: string,
  ): Promise<{ expectedPartCount: number; partSizeBytes: number; parts: UploadReceipt[] }>;
  completeSingle(uploadId: string): Promise<{ videoId: string; uploadId: string; status: string }>;
  completeMultipart(
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<{ videoId: string; uploadId: string; status: string }>;
  abortMultipart(uploadId: string): Promise<void>;
};
export type PutTransport = (
  signed: SignedPut,
  blob: Blob,
  options: { signal: AbortSignal; onProgress: (loaded: number) => void; expectEtag: boolean },
) => Promise<{ etag?: string }>;
export type UploadStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type UploadPhase =
  'preparing' | 'uploading' | 'verifying' | 'completed' | 'paused' | 'failed';
export type UploadProgress = {
  phase: UploadPhase;
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
  mode: UploadMode;
  message: string;
};
export type UploadFlowOptions = {
  ownerId: string;
  gateway: UploadGateway;
  transport: PutTransport;
  storage?: UploadStorage;
  now?: () => number;
  /** SHA-256 for one 8 MiB part, via WebCrypto by default. Null disables safe part skipping. */
  digest?: (blob: Blob) => Promise<string | null>;
};

const ABORT_ERROR = 'AbortError';
const SESSION_PREFIX = 'streamlab:upload:v1:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const hexDigest = /^[0-9a-f]{64}$/u;
const contentTypes: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm' };

export function validateUploadFile(file: UploadFile): void {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Dosya 1 bayt ile 2 GiB arasında olmalıdır.');
  }

  const hasInvalidCharacter = [...file.name].some((character) => {
    const code = character.charCodeAt(0);

    return character === '/' || character === '\\' || code <= 31 || code === 127;
  });

  if (!file.name || file.name.length > 255 || hasInvalidCharacter) {
    throw new Error('Dosya adı geçersiz.');
  }

  const ext = Object.keys(contentTypes).find((item) => file.name.toLowerCase().endsWith(item));
  if (!ext || contentTypes[ext] !== file.type) {
    throw new Error('Yalnızca dosya uzantısıyla eşleşen MP4 veya WebM videoları yüklenebilir.');
  }
}

export function uploadRecordKey(ownerId: string, videoId: string): string {
  if (!uuid.test(ownerId) || !uuid.test(videoId)) throw new Error('Invalid upload record scope');
  return `${SESSION_PREFIX}${ownerId}:${videoId}`;
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR;
}

export function abortUploadError(): Error {
  const error = new Error('Upload paused');
  error.name = ABORT_ERROR;
  return error;
}

async function browserDigest(blob: Blob): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const result = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validRecord(
  value: unknown,
  ownerId: string,
  videoId: string,
  now: number,
): value is UploadSession {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<UploadSession>;
  return (
    record.version === 1 &&
    record.ownerId === ownerId &&
    record.videoId === videoId &&
    typeof record.uploadId === 'string' &&
    uuid.test(record.uploadId) &&
    (record.mode === 'SINGLE' || record.mode === 'MULTIPART') &&
    typeof record.fileName === 'string' &&
    typeof record.contentType === 'string' &&
    typeof record.sizeBytes === 'number' &&
    Number.isSafeInteger(record.sizeBytes) &&
    record.sizeBytes >= 1 &&
    record.sizeBytes <= MAX_UPLOAD_BYTES &&
    typeof record.lastModified === 'number' &&
    typeof record.expiresAt === 'string' &&
    Number.isFinite(Date.parse(record.expiresAt)) &&
    Date.parse(record.expiresAt) > now &&
    record.partSizeBytes === MULTIPART_PART_BYTES &&
    !!record.partDigests &&
    typeof record.partDigests === 'object' &&
    !Array.isArray(record.partDigests) &&
    !!record.partEtags &&
    typeof record.partEtags === 'object' &&
    !Array.isArray(record.partEtags)
  );
}

export function createVideoUploadFlow(options: UploadFlowOptions) {
  const { gateway, transport, ownerId } = options;
  const now = options.now ?? Date.now;
  const digest = options.digest ?? browserDigest;
  const storage = options.storage;
  const inMemory = new Map<string, UploadSession>();
  function read(videoId: string): UploadSession | null {
    const cached = inMemory.get(videoId);
    if (cached) {
      if (validRecord(cached, ownerId, videoId, now())) return cached;
      inMemory.delete(videoId);
    }
    if (!storage) return null;
    const key = uploadRecordKey(ownerId, videoId);
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (validRecord(value, ownerId, videoId, now())) {
        inMemory.set(videoId, value);
        return value;
      }
      storage.removeItem(key);
    } catch {
      // Unavailable or corrupt browser storage must not break a new upload.
    }
    return null;
  }
  function write(session: UploadSession): void {
    inMemory.set(session.videoId, session);
    try {
      storage?.setItem(uploadRecordKey(ownerId, session.videoId), JSON.stringify(session));
    } catch {
      /* Storage blocked/quota exceeded: upload continues, reload recovery unavailable. */
    }
  }
  function clear(videoId: string): void {
    inMemory.delete(videoId);
    try {
      storage?.removeItem(uploadRecordKey(ownerId, videoId));
    } catch {
      /* ignored */
    }
  }
  async function run(input: {
    videoId: string;
    file: UploadFile;
    resume?: boolean;
    signal: AbortSignal;
    onProgress: (progress: UploadProgress) => void;
  }): Promise<void> {
    const { videoId, file, signal, onProgress } = input;
    validateUploadFile(file);
    if (signal.aborted) throw abortUploadError();
    const desiredMode: UploadMode = file.size <= SINGLE_PUT_MAX_BYTES ? 'SINGLE' : 'MULTIPART';
    let session = read(videoId);
    if (input.resume) {
      if (!session) throw new Error('Devam ettirilecek geçerli bir yükleme bulunamadı.');
      if (
        session.mode !== desiredMode ||
        session.fileName !== file.name ||
        session.contentType !== file.type ||
        session.sizeBytes !== file.size ||
        session.lastModified !== file.lastModified
      ) {
        throw new Error('Devam etmek için başlangıçta seçilen aynı dosyayı seçmelisin.');
      }
    } else {
      if (session)
        throw new Error('Aktif yükleme var. Aynı dosyayı seçip devam et veya oturumu iptal et.');
      const created =
        desiredMode === 'SINGLE'
          ? await gateway.createSingle(videoId, file)
          : await gateway.createMultipart(videoId, file);
      if (signal.aborted) throw abortUploadError();
      session = {
        version: 1,
        ownerId,
        videoId,
        uploadId: created.uploadId,
        mode: desiredMode,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        lastModified: file.lastModified,
        expiresAt: created.expiresAt,
        partSizeBytes: MULTIPART_PART_BYTES,
        partDigests: {},
        partEtags: {},
      };
      write(session);
    }
    const active = session;
    let lastBytesUploaded = 0;
    function notify(phase: UploadPhase, bytesUploaded: number, message: string) {
      lastBytesUploaded = Math.max(lastBytesUploaded, bytesUploaded);
      onProgress({
        phase,
        percent:
          phase === 'completed' ? 100 : Math.min(99, Math.floor((bytesUploaded / file.size) * 100)),
        bytesUploaded,
        totalBytes: file.size,
        mode: active.mode,
        message,
      });
    }
    notify('preparing', 0, 'Yükleme hazırlanıyor…');
    try {
      if (active.mode === 'SINGLE') {
        const signed = await gateway.signSingle(active.uploadId, active.contentType);
        if (signal.aborted) throw abortUploadError();
        await transport(signed, file, {
          signal,
          expectEtag: false,
          onProgress: (loaded) =>
            notify('uploading', Math.min(file.size, loaded), 'Dosya yükleniyor…'),
        });
      } else {
        const totalParts = Math.ceil(file.size / active.partSizeBytes);
        let uploaded = 0;
        let recovery;
        try {
          recovery = await gateway.listParts(active.uploadId);
        } catch (error) {
          // After S3 assembly, LIST is no longer possible. Retry trusted verification.
          // Server only allows /complete if storageUploadId has been atomically cleared.
          if (input.resume && isConflict(error)) {
            notify('verifying', file.size, 'Önceki tamamlama doğrulanıyor…');
            const completed = await gateway.completeSingle(active.uploadId);
            assertCompleted(completed, active);
            clear(videoId);
            notify('completed', file.size, 'Video doğrulandı.');
            return;
          }
          throw error;
        }
        if (
          recovery.expectedPartCount !== totalParts ||
          recovery.partSizeBytes !== active.partSizeBytes
        ) {
          throw new Error('Sunucunun parça planı dosyayla eşleşmiyor.');
        }
        const received = new Map<number, UploadReceipt>();
        for (const part of recovery.parts) {
          if (received.has(part.partNumber))
            throw new Error('Depolama tekrarlanan parça numarası bildirdi.');
          received.set(part.partNumber, part);
        }
        for (let number = 1; number <= totalParts; number++) {
          if (signal.aborted) throw abortUploadError();
          const offset = (number - 1) * active.partSizeBytes;
          const blob = file.slice(offset, Math.min(offset + active.partSizeBytes, file.size));
          const fromStorage = received.get(number);
          const recordedEtag = active.partEtags[String(number)];
          const recordedDigest = active.partDigests[String(number)];
          // Never trust fingerprint alone: only skip a part when its locally recorded
          // digest AND ETag match the server's current part receipt.
          let currentDigest: string | null = null;
          if (
            fromStorage &&
            fromStorage.sizeBytes === blob.size &&
            recordedEtag === fromStorage.etag &&
            recordedDigest &&
            hexDigest.test(recordedDigest)
          ) {
            currentDigest = await digest(blob);
          }
          if (fromStorage && currentDigest && currentDigest === recordedDigest) {
            uploaded += blob.size;
            notify(
              'uploading',
              uploaded,
              `Yüklenen parçalar doğrulanıyor (${number}/${totalParts})…`,
            );
            continue;
          }
          currentDigest ??= await digest(blob);
          let receivedEtag: string | undefined;
          for (let attempt = 1; attempt <= 3; attempt++) {
            if (signal.aborted) throw abortUploadError();
            try {
              const signed = await gateway.signPart(active.uploadId, number);
              const result = await transport(signed, blob, {
                signal,
                expectEtag: true,
                onProgress: (loaded) =>
                  notify(
                    'uploading',
                    uploaded + Math.min(blob.size, loaded),
                    `Parça ${number}/${totalParts} yükleniyor…`,
                  ),
              });
              receivedEtag = result.etag;
              if (!receivedEtag)
                throw new Error('S3 ETag başlığı eksik. Bucket CORS ExposeHeaders: ETag gerekli.');
              break;
            } catch (error) {
              if (signal.aborted || isAbort(error) || attempt === 3 || isConflict(error))
                throw error;
              // Re-sign on each attempt; signed URLs may have expired.
            }
          }
          if (!receivedEtag) throw new Error('Parça yüklenemedi.');
          active.partEtags[String(number)] = receivedEtag;
          if (currentDigest) active.partDigests[String(number)] = currentDigest;
          else delete active.partDigests[String(number)];
          write(active);
          uploaded += blob.size;
          notify('uploading', uploaded, `Parça ${number}/${totalParts} yüklendi.`);
        }
        if (signal.aborted) throw abortUploadError();
        // Read S3 again; never trust only client-side ETags for final completion.
        const final = await gateway.listParts(active.uploadId);
        if (final.expectedPartCount !== totalParts || final.parts.length !== totalParts) {
          throw new Error('S3 üzerinde beklenen tüm parçalar bulunamadı.');
        }
        const actual = new Map(final.parts.map((part) => [part.partNumber, part]));
        const receipts: Array<{ partNumber: number; etag: string }> = [];
        for (let number = 1; number <= totalParts; number++) {
          const part = actual.get(number);
          const expectedSize = Math.min(
            active.partSizeBytes,
            file.size - (number - 1) * active.partSizeBytes,
          );
          if (!part || part.sizeBytes !== expectedSize || !part.etag) {
            throw new Error(`Parça ${number} sunucuda doğrulanamadı.`);
          }
          receipts.push({ partNumber: number, etag: part.etag });
        }
        notify('verifying', file.size, 'Sunucuda parçalar birleştiriliyor ve video doğrulanıyor…');
        const completed = await gateway.completeMultipart(active.uploadId, receipts);
        assertCompleted(completed, active);
        clear(videoId);
        notify('completed', file.size, 'Video doğrulandı.');
        return;
      }
      if (signal.aborted) throw abortUploadError();
      notify('verifying', file.size, 'Sunucuda video doğrulanıyor…');
      const completed = await gateway.completeSingle(active.uploadId);
      assertCompleted(completed, active);
      clear(videoId);
      notify('completed', file.size, 'Video doğrulandı.');
    } catch (error) {
      notify(
        isAbort(error) || signal.aborted ? 'paused' : 'failed',
        lastBytesUploaded,
        isAbort(error) || signal.aborted
          ? 'Yükleme duraklatıldı.'
          : 'Yükleme tamamlanamadı; devam edebilirsin.',
      );
      throw error;
    }
  }
  async function abortMultipart(videoId: string): Promise<void> {
    const session = read(videoId);
    if (!session) return;
    if (session.mode !== 'MULTIPART') {
      throw new Error(
        'Tek-parça oturumu API üzerinden iptal edilemiyor; dosyayı yeniden seçip devam et.',
      );
    }
    await gateway.abortMultipart(session.uploadId);
    clear(videoId);
  }
  return { read, run, abortMultipart };
}

function assertCompleted(
  result: { videoId: string; uploadId: string; status: string },
  session: UploadSession,
): void {
  if (
    result.videoId !== session.videoId ||
    result.uploadId !== session.uploadId ||
    result.status !== 'UPLOADED'
  ) {
    throw new Error('Sunucu tamamlama yanıtı beklenen oturumla eşleşmiyor.');
  }
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const response = (error as { response?: { status?: number } }).response;
  return response?.status === 409;
}
