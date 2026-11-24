import { useEffect, useRef } from 'react';
import type { Video } from '@streamlab/contracts';
import { LoaderCircle } from 'lucide-react';

type Props = {
  video: Video;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Native modal dialog supplies focus containment, Escape and return-focus semantics. */
export function VideoDeleteDialog({ video, busy, error, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="video-delete-title"
      aria-describedby="video-delete-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(90vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/70"
    >
      <h2 id="video-delete-title" className="text-lg font-semibold">
        Videoyu sil?
      </h2>
      <p id="video-delete-description" className="mt-2 text-sm text-muted-foreground">
        <strong className="text-foreground">{video.title}</strong> silinmek üzere işaretlenecek ve
        listelerden kaldırılacak. Bu işlem geri alınamaz.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 hover:bg-secondary disabled:opacity-60"
        >
          Vazgeç
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-60"
        >
          {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          {busy ? 'Siliniyor…' : 'Evet, sil'}
        </button>
      </div>
    </dialog>
  );
}
