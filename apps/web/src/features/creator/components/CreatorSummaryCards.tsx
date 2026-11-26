import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useCreatorSummary } from '../hooks/useCreatorSummary';

export function CreatorSummaryCards() {
  const summary = useCreatorSummary();
  if (summary.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        İçerik özeti yükleniyor…
      </p>
    );
  }
  if (summary.isError) {
    return (
      <section role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="flex items-center gap-2">
          <CircleAlert className="size-4" aria-hidden="true" />
          İçerik istatistikleri alınamadı.
        </p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-border px-3 py-2 hover:bg-secondary"
          onClick={() => void summary.refetch()}
        >
          Tekrar dene
        </button>
      </section>
    );
  }
  const metrics = [
    { title: 'Toplam video', count: summary.data.totalVideos },
    { title: 'Taslak', count: summary.data.draftVideos },
    { title: 'İşleniyor', count: summary.data.processingVideos },
    { title: 'Hazır', count: summary.data.readyVideos },
    { title: 'Yayında', count: summary.data.publishedVideos },
    { title: 'Başarısız', count: summary.data.failedVideos },
  ];
  return (
    <section
      aria-label="İçerik istatistikleri"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {metrics.map((metric) => (
        <article key={metric.title} className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{metric.title}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{metric.count}</p>
        </article>
      ))}
    </section>
  );
}
