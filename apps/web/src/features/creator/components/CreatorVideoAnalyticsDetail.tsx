/** STREAM-008.6: Per-video KPIs and accessible, aggregated UTC trend chart. */
import type { CreatorAnalyticsRange } from '@streamlab/contracts';
import { useCreatorVideoAnalytics } from '../hooks/useCreatorVideoAnalytics';

function int(value: number) {
  return new Intl.NumberFormat('tr-TR').format(value);
}
function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${int(minutes)} dk` : `${int(seconds)} sn`;
}

export function CreatorVideoAnalyticsDetail({
  videoId,
  range,
  onClose,
}: {
  videoId: string;
  range: CreatorAnalyticsRange;
  onClose: () => void;
}) {
  const result = useCreatorVideoAnalytics(videoId, range);
  const data = result.data;
  const peak = Math.max(1, ...(data?.daily.map((row) => row.qualifiedViews) ?? []));
  return (
    <section
      aria-label="Seçili video analitiği"
      className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Video performans detayı</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Kapat
        </button>
      </div>
      {result.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Video analitiği yükleniyor…
        </p>
      ) : result.isError ? (
        <div role="alert" className="text-sm">
          Video analitiği alınamadı.
          <button
            type="button"
            className="ml-3 rounded-md border border-border px-3 py-1"
            onClick={() => void result.refetch()}
          >
            Tekrar dene
          </button>
        </div>
      ) : data ? (
        <>
          <p className="break-words text-sm font-medium">{data.title}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Nitelikli izlenme', int(data.qualifiedViews)],
              ['İzlenme süresi', duration(data.watchSeconds)],
              ['Ortalama izlenme', duration(data.averageWatchSeconds)],
              ['Tamamlanma', `${data.completionRatePercent.toLocaleString('tr-TR')}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {data.daily.length ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Günlük nitelikli izlenmeler (UTC)</h4>
              <div className="overflow-x-auto">
                <div
                  className="flex h-36 min-w-[360px] items-end gap-1 border-b border-border pb-1"
                  role="img"
                  aria-label={`${data.daily.length} UTC gününe ait nitelikli izlenme grafiği`}
                >
                  {data.daily.map((row) => (
                    <div
                      key={row.day}
                      className="flex h-full min-w-0 flex-1 items-end"
                      title={`${row.day}: ${int(row.qualifiedViews)} izlenme, ${duration(row.watchSeconds)}`}
                    >
                      <div
                        className="w-full rounded-t-sm bg-sky-500"
                        style={{
                          height: `${Math.max(row.qualifiedViews ? 4 : 1, (row.qualifiedViews / peak) * 100)}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>{data.daily[0]?.day}</span>
                <span>{data.daily[data.daily.length - 1]?.day}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Çubukların üzerine gelerek günlük değerleri görebilirsin. Sıfır olan günler de
                gösterilir.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tüm zamanlar için toplam metrikler gösteriliyor. Günlük eğilim grafiği için 7 veya 30
              gün seç.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
