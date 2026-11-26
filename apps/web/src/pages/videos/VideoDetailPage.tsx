import { Link, useParams } from 'react-router';
import { HlsPlayer } from '@/features/playback/components/HlsPlayer';
import { usePlayback } from '@/features/playback/hooks/usePlayback';
import { usePlaybackAnalytics } from '@/features/playback/hooks/usePlaybackAnalytics';
import { useWatchProgress } from '@/features/watch-history/hooks/useWatchProgress';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useVideoDetail } from '@/features/videos/hooks/useVideoQueries';

export function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { status, user } = useAuth();
  // Private videos must not be fetched before the refresh-cookie bootstrap completes.
  if (status === 'loading') return <p role="status">Oturum kontrol ediliyor…</p>;
  if (status === 'error') return <p role="alert">Oturum doğrulanamadı. Sayfayı yenileyin.</p>;
  return <ResolvedVideoDetail key={`${videoId}:${user?.id ?? 'anonymous'}`} videoId={videoId} />;
}

function ResolvedVideoDetail({ videoId }: { videoId?: string }) {
  const videoQuery = useVideoDetail(videoId);
  const ready = videoQuery.data?.status === 'READY';
  const playbackQuery = usePlayback(videoId, ready);
  const watch = useWatchProgress(videoId, ready);
  const analytics = usePlaybackAnalytics(videoId, playbackQuery.data?.manifestUrl);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Link className="inline-flex text-sm font-semibold text-sky-400 hover:underline" to="/">
        Keşfet sayfasına dön
      </Link>
      {videoQuery.isPending ? (
        <p role="status">Video bilgileri yükleniyor…</p>
      ) : videoQuery.isError ? (
        <p role="alert">Video bulunamadı veya görüntüleme izniniz yok.</p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{videoQuery.data.title}</h1>
          {ready ? (
            watch.isLoadingProgress ? (
              <p role="status">Son izleme konumun yükleniyor…</p>
            ) : playbackQuery.isPending ? (
              <p role="status">Oynatma bağlantısı hazırlanıyor…</p>
            ) : playbackQuery.isError ? (
              <div role="alert" className="space-y-3">
                <p>Video oynatma bağlantısı alınamadı. Video erişiminizi kontrol edin.</p>
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                  onClick={() => void playbackQuery.refetch()}
                >
                  Tekrar dene
                </button>
              </div>
            ) : (
              <HlsPlayer
                manifestUrl={playbackQuery.data.manifestUrl}
                title={videoQuery.data.title}
                initialPositionSeconds={watch.resumeSeconds}
                onWatchProgress={watch.report}
                onPlaybackAnalytics={analytics.report}
                onRefreshPlayback={async () => {
                  const previousUrl = playbackQuery.data.manifestUrl;
                  const refreshed = await playbackQuery.refetch();
                  if (refreshed.isError) throw refreshed.error;
                  return refreshed.data?.manifestUrl !== previousUrl;
                }}
              />
            )
          ) : (
            <p role="status" className="rounded-xl border border-border bg-card p-5">
              Bu video henüz oynatılmaya hazır değil. İşleme durumu: {videoQuery.data.status}.
            </p>
          )}
          {watch.readFailed && (
            <p role="status" className="text-sm text-amber-500">
              Son izleme konumu alınamadı; video başlangıçtan oynatılacak.
            </p>
          )}
          {watch.saveFailed && (
            <p role="status" className="text-sm text-amber-500">
              İzleme ilerlemesi kaydedilemedi. Bağlantı düzelince tekrar denenecek.
            </p>
          )}
          {videoQuery.data.description && (
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {videoQuery.data.description}
            </p>
          )}
        </>
      )}
    </section>
  );
}
