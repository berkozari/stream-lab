import { CreateVideoRequestSchema, type Video } from '@streamlab/contracts';

export type VideoMetadataFields = { title: string; description: string };

/** Use the exact shared Create contract rather than duplicating its limits in the UI. */
export function validateVideoMetadata(fields: VideoMetadataFields) {
  const parsed = CreateVideoRequestSchema.safeParse({
    title: fields.title,
    description: fields.description.trim() ? fields.description : null,
    categoryIds: [],
  });

  if (parsed.success) return { success: true as const, data: parsed.data };
  const errors = parsed.error.flatten().fieldErrors;
  return {
    success: false as const,
    errors: {
      title: errors.title?.[0] ? 'Başlık 1–160 karakter olmalıdır.' : undefined,
      description: errors.description?.[0]
        ? 'Açıklama en fazla 10.000 karakter olabilir.'
        : undefined,
    },
  };
}

export function canChangeVideoVisibility(video: Video): boolean {
  return video.status === 'READY';
}

export const VIDEO_STATUS_LABELS: Record<Video['status'], string> = {
  DRAFT: 'Taslak',
  UPLOADING: 'Yükleniyor',
  UPLOADED: 'Yüklendi',
  QUEUED: 'Sırada',
  PROCESSING: 'İşleniyor',
  READY: 'Hazır',
  FAILED: 'İşleme hatası',
  DELETING: 'Siliniyor',
};

export const VIDEO_VISIBILITY_LABELS: Record<Video['visibility'], string> = {
  PRIVATE: 'Özel',
  UNLISTED: 'Liste dışı',
  PUBLIC: 'Herkese açık',
};

export function videoDateLabel(date: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(date));
}

export function videoRequestError(error: unknown): string {
  const response = error as { response?: { status?: number } } | null;
  switch (response?.response?.status) {
    case 401:
      return 'Oturumunuzun süresi dolmuş olabilir. Yeniden giriş yapın.';
    case 403:
    case 404:
      return 'Video bulunamadı veya bu işlem için yetkiniz yok.';
    case 409:
      return 'Video işlenip hazır hale gelmeden yayınlanamaz.';
    case 422:
      return 'Video bilgileri geçersiz. Başlık ve açıklamayı kontrol edin.';
    case 429:
      return 'Çok fazla istek yapıldı. Biraz sonra tekrar deneyin.';
    default:
      return 'İşlem tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.';
  }
}
