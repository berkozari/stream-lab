import { useId, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { Video } from '@streamlab/contracts';

type VideoVisibility = Video['visibility'];
import { canChangeVideoVisibility, validateVideoMetadata } from '../utils/video-ui.utils';

export type VideoMetadataInput = {
  title: string;
  description: string | null;
  visibility?: VideoVisibility;
};

type Props = {
  video?: Video;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: VideoMetadataInput) => Promise<void>;
};

const fieldClass =
  'mt-2 block w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive';

export function VideoMetadataForm({ video, busy, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(video?.title ?? '');
  const [description, setDescription] = useState(video?.description ?? '');
  const [visibility, setVisibility] = useState<VideoVisibility>(video?.visibility ?? 'PRIVATE');
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [submitError, setSubmitError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const allowVisibility = video ? canChangeVideoVisibility(video) : false;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitError('');
    const parsed = validateVideoMetadata({ title, description });
    if (!parsed.success) {
      setErrors(parsed.errors);
      if (parsed.errors.title) titleRef.current?.focus();
      return;
    }
    setErrors({});
    try {
      await onSave({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        ...(allowVisibility ? { visibility } : {}),
      });
    } catch (error) {
      // Parent keeps mutation failures visible without leaking backend internals.
      setSubmitError(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-busy={busy}
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {video ? 'Video bilgilerini düzenle' : 'Yeni video oluştur'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {video
            ? 'Başlığı, açıklamayı ve uygun olduğunda görünürlüğü güncelle.'
            : 'Video kaydı taslak ve özel görünürlükle oluşturulur. Dosya yükleme daha sonra eklenecek.'}
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          Video başlığı
        </label>
        <input
          id={`${id}-title`}
          ref={titleRef}
          name="title"
          required
          maxLength={160}
          disabled={busy}
          value={title}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrors((current) => ({ ...current, title: undefined }));
          }}
          className={fieldClass}
        />
        {errors.title && (
          <p role="alert" id={`${id}-title-error`} className="mt-1 text-sm text-destructive">
            {errors.title}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          Açıklama (isteğe bağlı)
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={4}
          maxLength={10_000}
          disabled={busy}
          value={description}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? `${id}-description-error` : undefined}
          onChange={(event) => {
            setDescription(event.target.value);
            setErrors((current) => ({ ...current, description: undefined }));
          }}
          className={fieldClass}
        />
        {errors.description && (
          <p role="alert" id={`${id}-description-error`} className="mt-1 text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>
      {video && (
        <div>
          <label htmlFor={`${id}-visibility`} className="text-sm font-medium">
            Görünürlük
          </label>
          <select
            id={`${id}-visibility`}
            name="visibility"
            value={visibility}
            disabled={busy || !allowVisibility}
            onChange={(event) => setVisibility(event.target.value as VideoVisibility)}
            className={fieldClass}
          >
            <option value="PRIVATE">Özel</option>
            {allowVisibility && <option value="UNLISTED">Liste dışı</option>}
            {allowVisibility && <option value="PUBLIC">Herkese açık</option>}
          </select>
          {!allowVisibility && (
            <p className="mt-1 text-xs text-muted-foreground">
              Yayınlanmamış videoların görünürlüğü bu ekrandan değiştirilemez.
            </p>
          )}
        </div>
      )}
      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {submitError}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Kaydediliyor…' : video ? 'Değişiklikleri kaydet' : 'Video oluştur'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 hover:bg-secondary disabled:opacity-60"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
