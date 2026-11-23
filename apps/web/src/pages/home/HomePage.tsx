import { ArrowUpRight, Clapperboard, Database, Layers3, PlayCircle } from 'lucide-react';
import { Link } from 'react-router';
import { ApiStatus } from '@/features/health/components/ApiStatus';

const modules = [
  {
    title: 'Video kataloğu',
    description: 'Video listeleme, kategori ve arama STREAM-007 kapsamında geliştirilecek.',
    icon: Clapperboard,
  },
  {
    title: 'Video oynatıcı',
    description: 'HLS oynatma ve kalite kontrolü STREAM-006 kapsamında eklenecek.',
    icon: PlayCircle,
  },
  {
    title: 'İçerik yükleme',
    description: 'Presigned upload ve işleme adımları STREAM-004/005 kapsamında eklenecek.',
    icon: Layers3,
  },
] as const;

export function HomePage() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card px-7 py-14 sm:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-sky-500/12 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            STREAM-001.7 · Frontend Foundation
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Video streaming platformunun arayüz temeli.
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            React Router, TanStack Query, Tailwind CSS ve merkezi API client hazır. Video
            özellikleri sonraki milestone'larda eklenecek.
          </p>
          <Link
            to="/creator"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            İçerik paneline git <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="space-y-4" aria-labelledby="infrastructure-heading">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-sky-400" aria-hidden="true" />
          <h2 id="infrastructure-heading" className="text-lg font-semibold">
            Servis durumu
          </h2>
        </div>
        <ApiStatus />
      </section>
      <section className="grid gap-4 md:grid-cols-3" aria-label="Gelecek modüller">
        {modules.map(({ title, description, icon: Icon }) => (
          <article key={title} className="rounded-2xl border border-border bg-card p-6">
            <Icon aria-hidden="true" className="size-6 text-sky-400" />
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
