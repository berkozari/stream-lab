import { useState, type ChangeEvent } from 'react';
import { CircleAlert, FileVideo2, LoaderCircle, Pause, Play, UploadCloud, X } from 'lucide-react';
import { useVideoUpload } from '../hooks/useVideoUpload';
import { MAX_UPLOAD_BYTES, SINGLE_PUT_MAX_BYTES } from '../services/video-upload-flow';

const buttonClass =
  'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';

function sizeLabel(size: number): string {
  return `${(size / 1_048_576).toFixed(1)} MiB`;
}

export function VideoUploadPanel({
  videoId,
  videoTitle,
  onClose,
  onCompleted,
}: {
  videoId: string;
  videoTitle: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const { saved, progress, error, busy, start, resume, pause, cancel } = useVideoUpload(
    videoId,
    onCompleted,
  );
  const isComplete = progress?.phase === 'completed';
  const needsReselect = saved !== null;
  const fileMismatch =
    saved &&
    file &&
    (saved.fileName !== file.name ||
      saved.sizeBytes !== file.size ||
      saved.contentType !== file.type ||
      saved.lastModified !== file.lastModified);
  const mode = file
    ? file.size <= SINGLE_PUT_MAX_BYTES
      ? 'Tek parça'
      : 'Multipart (8 MiB parçalar)'
    : null;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }
  return (
    <section
      className="mt-4 space-y-4 rounded-xl border border-sky-500/30 bg-card p-4"
      aria-label={`${videoTitle} dosya yükleme`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">Video dosyası yükle</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            MP4 veya WebM · en fazla 2 GiB · dosya doğrudan özel storage alanına gider
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={onClose}
          disabled={busy}
          aria-label="Yükleme panelini kapat"
        >
          <X className="size-4" aria-hidden="true" /> Kapat
        </button>
      </div>

      {saved && (
        <div role="status" className="rounded-lg border border-amber-500/40 p-3 text-sm">
          <strong>Devam ettirilebilir oturum:</strong> {saved.fileName} (
          {sizeLabel(saved.sizeBytes)})
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(saved.expiresAt).toLocaleString('tr-TR')} tarihine kadar geçerli. Güvenlik
            için aynı dosyayı yeniden seçmelisin.
          </p>
        </div>
      )}

      <label className="block space-y-2 text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          <FileVideo2 className="size-4" aria-hidden="true" /> Video dosyası
        </span>
        <input
          type="file"
          accept=".mp4,.webm,video/mp4,video/webm"
          onChange={selectFile}
          disabled={busy || isComplete}
          className="block w-full rounded-lg border border-input bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground"
        />
      </label>
      {file && (
        <p className="text-xs text-muted-foreground">
          {file.name} · {sizeLabel(file.size)} · {mode}
          {file.size > MAX_UPLOAD_BYTES && (
            <span className="ml-2 text-destructive">2 GiB sınırı aşıldı.</span>
          )}
        </p>
      )}
      {fileMismatch && (
        <p role="alert" className="text-sm text-destructive">
          Bu dosya kayıtlı oturumla eşleşmiyor. Aynı dosyayı seçmelisin.
        </p>
      )}

      {progress && (
        <div role="status" className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>{progress.message}</span>
            <span className="tabular-nums">{progress.percent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label="Video yükleme ilerlemesi"
          >
            <div
              className="h-full rounded-full bg-sky-500 transition-[width]"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {sizeLabel(progress.bytesUploaded)} / {sizeLabel(progress.totalBytes)}
            {progress.phase === 'verifying' && ' · Dosya aktarıldı; sunucu doğrulaması sürüyor.'}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!busy &&
          !isComplete &&
          file &&
          !fileMismatch &&
          file.size >= 1 &&
          file.size <= MAX_UPLOAD_BYTES && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => (needsReselect ? resume(file) : start(file))}
            >
              {needsReselect ? (
                <Play className="size-4" aria-hidden="true" />
              ) : (
                <UploadCloud className="size-4" aria-hidden="true" />
              )}
              {needsReselect ? 'Yüklemeye devam et' : 'Yüklemeyi başlat'}
            </button>
          )}
        {busy && progress?.phase !== 'verifying' && (
          <button type="button" className={buttonClass} onClick={pause}>
            <Pause className="size-4" aria-hidden="true" /> Duraklat
          </button>
        )}
        {busy && (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            İşlem sürüyor…
          </span>
        )}
        {!busy && saved?.mode === 'MULTIPART' && (
          <button
            type="button"
            className={`${buttonClass} text-destructive`}
            onClick={() => void cancel()}
          >
            Multipart oturumunu iptal et
          </button>
        )}
      </div>
      {saved?.mode === 'SINGLE' && (
        <p className="text-xs text-muted-foreground">
          Tek-parça yüklemede sunucu tarafında iptal endpoint'i henüz yok. Duraklattıktan sonra aynı
          dosyayı seçerek devam edebilirsin.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sayfa kapanırsa dosya tarayıcıda saklanmaz. Kayıtlı oturum varsa aynı dosyayı tekrar seçerek
        devam edebilirsin.
      </p>
    </section>
  );
}
