import { useState, type FormEvent } from 'react';
import {
  UploadCloud,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Video as VideoIcon,
} from 'lucide-react';
import type { Video } from '@streamlab/contracts';
import { useMyVideos } from '../hooks/useVideoQueries';
import { useCreateVideo, useDeleteVideo, useUpdateVideo } from '../hooks/useVideoMutations';
import { VideoDeleteDialog } from './VideoDeleteDialog';
import { VideoMetadataForm, type VideoMetadataInput } from './VideoMetadataForm';
import { VideoUploadPanel } from './VideoUploadPanel';
import {
  VIDEO_STATUS_LABELS,
  VIDEO_VISIBILITY_LABELS,
  videoDateLabel,
  videoRequestError,
} from '../utils/video-ui.utils';

const actionClass =
  'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60';

export function CreatorVideoManagement() {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState<Video | null>(null);
  const [uploadingVideoId, setUploadingVideoId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const videos = useMyVideos({ ...(searchTerm ? { q: searchTerm } : {}), limit: 12 });
  const create = useCreateVideo();
  const update = useUpdateVideo();
  const remove = useDeleteVideo();
  const items = videos.data?.pages.flatMap((page) => page.items) ?? [];
  const editingOrCreating = creating || editing !== null;

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = searchInput.trim();
    setSearchTerm(value || undefined);
    setNotice('');
  }

  async function saveVideo(input: VideoMetadataInput) {
    try {
      if (editing) {
        await update.mutateAsync({ videoId: editing.id, data: input });
        setNotice('Video bilgileri güncellendi.');
      } else {
        await create.mutateAsync({
          title: input.title,
          description: input.description,
          categoryIds: input.categoryIds,
        });
        setNotice('Video taslağı oluşturuldu. Listeden “Dosya yükle” ile devam edebilirsin.');
      }
      setEditing(null);
      setCreating(false);
    } catch (error) {
      throw new Error(videoRequestError(error), {
        cause: error,
      });
    }
  }

  async function confirmDelete() {
    if (!deleting || remove.isPending) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
      setEditing(null);
      setNotice('Video silinmek üzere işaretlendi.');
    } catch (error) {
      setDeleteError(videoRequestError(error));
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="creator-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            Creator Dashboard
          </p>
          <h1 id="creator-heading" className="mt-2 text-3xl font-semibold tracking-tight">
            İçerik yönetimi
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Videolarını düzenle ve yeni taslaklar oluştur.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreating(true);
            setNotice('');
          }}
          disabled={editingOrCreating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden="true" />
          Yeni video
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
          {notice}
        </p>
      )}

      {editingOrCreating && (
        <VideoMetadataForm
          key={editing?.id ?? 'create'}
          {...(editing ? { video: editing } : {})}
          busy={create.isPending || update.isPending}
          onSave={saveVideo}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Videolarım</h2>
          <span className="text-xs text-muted-foreground">{items.length} video gösteriliyor</span>
        </div>
        <form onSubmit={applySearch} role="search" className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="creator-video-search" className="sr-only">
            Videolarımda ara
          </label>
          <input
            id="creator-video-search"
            name="q"
            type="search"
            maxLength={100}
            placeholder="Video başlığı ara"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <button type="submit" className={actionClass}>
            <Search className="size-4" aria-hidden="true" />
            Ara
          </button>
          {searchTerm && (
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                setSearchInput('');
                setSearchTerm(undefined);
              }}
            >
              Temizle
            </button>
          )}
        </form>

        {videos.isPending ? (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Videolar yükleniyor…
          </p>
        ) : videos.isError ? (
          <div role="alert" className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm">
            <div className="flex items-center gap-2">
              <CircleAlert className="size-4" aria-hidden="true" />
              {videoRequestError(videos.error)}
            </div>
            <button
              type="button"
              className={`${actionClass} mt-3`}
              onClick={() => void videos.refetch()}
            >
              Tekrar dene
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <VideoIcon aria-hidden="true" className="mx-auto size-9 text-sky-400" />
            <h3 className="mt-3 font-semibold">
              {searchTerm ? 'Aramanla eşleşen video yok' : 'Henüz video bulunmuyor'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {searchTerm
                ? 'Farklı bir başlıkla aramayı deneyebilirsin.'
                : '“Yeni video” ile ilk taslağını oluşturabilirsin.'}
            </p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-border" aria-label="Video listesi">
            {items.map((video) => (
              <li
                key={video.id}
                className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className="break-words font-semibold">{video.title}</h3>
                  {video.description && (
                    <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                      {video.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2 py-1 text-foreground">
                      {VIDEO_STATUS_LABELS[video.status]}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-1 text-foreground">
                      {VIDEO_VISIBILITY_LABELS[video.visibility]}
                    </span>
                    <span>{videoDateLabel(video.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {(video.status === 'DRAFT' || video.status === 'UPLOADING') && (
                    <button
                      type="button"
                      className={actionClass}
                      disabled={editingOrCreating}
                      aria-label="Video dosyasını yükle"
                      onClick={() => {
                        setUploadingVideoId((current) => (current === video.id ? null : video.id));
                        setNotice('');
                      }}
                    >
                      <UploadCloud className="size-4" aria-hidden="true" />
                      Dosya yükle
                    </button>
                  )}
                  <button
                    type="button"
                    className={actionClass}
                    disabled={editingOrCreating}
                    onClick={() => {
                      setCreating(false);
                      setEditing(video);
                      setNotice('');
                    }}
                    aria-label={`${video.title} videosunu düzenle`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className={`${actionClass} text-red-400`}
                    onClick={() => {
                      setDeleting(video);
                      setDeleteError(null);
                    }}
                    aria-label={`${video.title} videosunu sil`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Sil
                  </button>
                </div>

                {uploadingVideoId === video.id && (
                  <div className="w-full">
                    <VideoUploadPanel
                      key={video.id}
                      videoId={video.id}
                      videoTitle={video.title}
                      onClose={() => setUploadingVideoId(null)}
                      onCompleted={() => {
                        setUploadingVideoId(null);
                        setNotice('Video dosyası doğrulandı.');
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {videos.hasNextPage && !videos.isError && (
          <div className="mt-5 text-center">
            <button
              type="button"
              disabled={videos.isFetchingNextPage}
              onClick={() => void videos.fetchNextPage()}
              className={actionClass}
            >
              {videos.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
            </button>
          </div>
        )}
      </div>

      {deleting && (
        <VideoDeleteDialog
          video={deleting}
          busy={remove.isPending}
          error={deleteError}
          onCancel={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </section>
  );
}
