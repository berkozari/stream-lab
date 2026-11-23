import { Link, useParams } from 'react-router';

export function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  return (
    <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-border bg-card p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
        Video Detail · Placeholder
      </p>
      <h1 className="text-2xl font-semibold">Video oynatma henüz aktif değil</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Video ID: {videoId ?? 'bilinmiyor'}. Gerçek video verisi, erişim kontrolü ve HLS player
        ileriki milestone'larda eklenecek.
      </p>
      <Link className="inline-flex text-sm font-semibold text-sky-400 hover:underline" to="/">
        Keşfet sayfasına dön
      </Link>
    </section>
  );
}
