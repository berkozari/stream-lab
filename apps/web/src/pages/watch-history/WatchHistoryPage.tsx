import { Link } from 'react-router';
import { Clock3, PlayCircle } from 'lucide-react';
import { useWatchList } from '@/features/watch-history/hooks/useWatchProgress';
import type { WatchListMode } from '@/features/watch-history/services/watch-progress-client';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function WatchHistoryPage({ mode }: { mode: WatchListMode }) {
  const query = useWatchList(mode);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const continuing = mode === 'continue';
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          {continuing ? 'İzlemeye devam et' : 'İzleme geçmişim'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {continuing
            ? 'Yarım bıraktığın videolara kaldığın yerden devam et.'
            : 'Son izlediğin ve erişmeye devam edebildiğin videolar.'}
        </p>
      </div>
      {query.isPending ? (
        <p role="status">İzleme kayıtları yükleniyor…</p>
      ) : query.isError ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-5">
          <p>İzleme kayıtları alınamadı.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-sky-400 underline"
          >
            Tekrar dene
          </button>
        </div>
      ) : items.length === 0 ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-card p-5 text-muted-foreground"
        >
          {continuing ? 'Devam edilecek video bulunamadı.' : 'Henüz izleme geçmişin yok.'}
        </p>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const duration = item.video.durationSeconds;
              const percent =
                duration && duration > 0
                  ? Math.min(100, Math.round((item.positionSeconds / duration) * 100))
                  : null;
              return (
                <li key={item.videoId}>
                  <Link
                    to={`/watch/${item.videoId}`}
                    className="group block rounded-xl border border-border bg-card p-5 hover:border-sky-500/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="mb-3 flex items-center gap-2 text-sky-400">
                      {continuing ? (
                        <PlayCircle aria-hidden="true" />
                      ) : (
                        <Clock3 aria-hidden="true" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.lastWatchedAt).toLocaleString('tr-TR')}
                      </span>
                    </div>
                    <h2 className="line-clamp-2 font-semibold group-hover:text-sky-400">
                      {item.video.title}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatTime(item.positionSeconds)}
                      {duration !== null ? ` / ${formatTime(duration)}` : ''}
                      {item.completedAt ? ' · Tamamlandı' : ''}
                    </p>
                    {percent !== null && (
                      <div
                        role="progressbar"
                        aria-label={`${item.video.title} izleme ilerlemesi`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
                      >
                        <div
                          className="h-full rounded-full bg-sky-400"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {query.hasNextPage && (
            <button
              type="button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
              className="rounded-lg border border-border px-5 py-2 font-semibold hover:bg-secondary disabled:opacity-60"
            >
              {query.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla göster'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
