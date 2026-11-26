/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import { useState } from 'react';
import type { CreatorAnalyticsRange } from '@streamlab/contracts';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useCreatorAnalytics } from '../hooks/useCreatorAnalytics';
import { CreatorVideoAnalyticsDetail } from './CreatorVideoAnalyticsDetail';

const formatNumber = (value: number) => new Intl.NumberFormat('tr-TR').format(value);
const formatPercent = (value: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value) + '%';
function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${formatNumber(hours)} sa ${minutes} dk`;
  if (minutes) return `${formatNumber(minutes)} dk`;
  return `${formatNumber(seconds)} sn`;
}

export function CreatorAnalyticsPanel({
  selectedVideoId,
  onSelectVideo,
  onCloseVideo,
}: {
  selectedVideoId: string | null;
  onSelectVideo: (id: string) => void;
  onCloseVideo: () => void;
}) {
  const [range, setRange] = useState<CreatorAnalyticsRange>('7d');
  const analytics = useCreatorAnalytics(range);
  return (
    <section aria-label="Video performans analitiği" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Video analitiği</h2>
          <p className="text-sm text-muted-foreground">
            Nitelikli oynatma oturumları (en az 3 saniye)
          </p>
        </div>
        <label htmlFor="creator-analytics-range" className="flex items-center gap-2 text-sm">
          Dönem
          <select
            id="creator-analytics-range"
            value={range}
            onChange={(event) => setRange(event.target.value as CreatorAnalyticsRange)}
            className="rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="7d">Son 7 gün</option>
            <option value="30d">Son 30 gün</option>
            <option value="all">Tüm zamanlar</option>
          </select>
        </label>
      </div>
      {analytics.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Analitik verileri yükleniyor…
        </p>
      ) : analytics.isError ? (
        <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
          <CircleAlert className="mr-2 inline size-4" aria-hidden="true" />
          Analitik verileri alınamadı.
          <button
            type="button"
            className="ml-3 rounded-md border border-border px-3 py-1 hover:bg-secondary"
            onClick={() => void analytics.refetch()}
          >
            Tekrar dene
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Nitelikli izlenme', value: formatNumber(analytics.data.qualifiedViews) },
              {
                label: 'Toplam izlenme süresi',
                value: formatDuration(analytics.data.watchSeconds),
              },
              {
                label: 'Ortalama izleme',
                value: formatDuration(analytics.data.averageWatchSeconds),
              },
              {
                label: 'Tamamlanma oranı',
                value: formatPercent(analytics.data.completionRatePercent),
              },
            ].map(({ label, value }) => (
              <article key={label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </article>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">En çok izlenen videolar</h3>
            {analytics.data.topVideos.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Bu dönemde nitelikli izlenme bulunmuyor.
              </p>
            ) : (
              <ol className="mt-4 space-y-4">
                {analytics.data.topVideos.map((video) => {
                  const highest = analytics.data.topVideos[0]?.qualifiedViews ?? 1;
                  const share = Math.max(0, (video.qualifiedViews / highest) * 100);
                  return (
                    <li key={video.videoId} className="space-y-1">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate" title={video.title}>
                          {video.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 tabular-nums">
                          {formatNumber(video.qualifiedViews)} izlenme
                          <button
                            type="button"
                            onClick={() => onSelectVideo(video.videoId)}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                            aria-label={`${video.title} videosunun analitiğini görüntüle`}
                          >
                            Detay
                          </button>
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-secondary"
                        role="img"
                        aria-label={`${video.title}: ${formatNumber(video.qualifiedViews)} nitelikli izlenme`}
                      >
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(video.watchSeconds)} ·{' '}
                        {formatPercent(video.completionRatePercent)} tamamlanma
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {selectedVideoId && (
            <CreatorVideoAnalyticsDetail
              key={selectedVideoId}
              videoId={selectedVideoId}
              range={range}
              onClose={onCloseVideo}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Bu rakamlar nitelikli oturumları gösterir; benzersiz kişi veya botlardan arındırılmış
            görüntülenme sayısı değildir. Dönem, oturum başlangıcına göre hesaplanır.
          </p>
        </>
      )}
    </section>
  );
}
