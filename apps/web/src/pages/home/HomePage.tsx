import { useRef, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Clapperboard, Search } from 'lucide-react';
import { usePublicVideos } from '@/features/videos/hooks/useVideoQueries';
import { useCategories } from '@/features/discovery/hooks/useCategories';
import {
  makeDiscoverySearch,
  readDiscoveryFilters,
} from '@/features/discovery/utils/discovery-search';

function durationLabel(seconds: number | null): string {
  if (seconds === null) return 'Süre bilinmiyor';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readDiscoveryFilters(searchParams);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categories = useCategories();
  const videos = usePublicVideos(filters);
  const items = videos.data?.pages.flatMap((page) => page.items) ?? [];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchParams(makeDiscoverySearch(searchInputRef.current?.value ?? '', filters.category));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
          StreamLab · Discovery
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Videoları keşfet</h1>
        <p className="text-sm text-muted-foreground">
          Yayınlanmış videoları ara ve kategorilere göre keşfet.
        </p>
      </section>

      <form onSubmit={submitSearch} role="search" className="flex flex-col gap-3 sm:flex-row">
        <label
          className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium"
          htmlFor="discovery-search"
        >
          Video ara
          <input
            id="discovery-search"
            name="q"
            type="search"
            maxLength={100}
            key={searchParams.toString()}
            ref={searchInputRef}
            defaultValue={filters.q ?? ''}
            placeholder="Video başlığı veya açıklaması"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>
        <label
          className="flex flex-col gap-1.5 text-sm font-medium sm:min-w-44"
          htmlFor="discovery-category"
        >
          Kategori
          <select
            id="discovery-category"
            value={filters.category ?? ''}
            onChange={(event) =>
              setSearchParams(
                makeDiscoverySearch(
                  searchInputRef.current?.value ?? '',
                  event.target.value || undefined,
                ),
              )
            }
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value="">Tüm kategoriler</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground hover:opacity-90"
        >
          <Search aria-hidden="true" className="size-4" /> Ara
        </button>
      </form>

      {categories.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          Kategoriler alınamadı. Arama ve video listesi kullanılabilir.
        </p>
      )}

      <section className="space-y-5" aria-labelledby="discovery-heading">
        <div className="flex items-center gap-2">
          <Clapperboard aria-hidden="true" className="size-5 text-sky-400" />
          <h2 id="discovery-heading" className="text-xl font-semibold">
            Videolar
          </h2>
        </div>
        {videos.isPending ? (
          <p role="status">Videolar yükleniyor…</p>
        ) : videos.isError ? (
          <div role="alert" className="space-y-2 rounded-xl border border-border p-5">
            <p>Videolar yüklenemedi.</p>
            <button
              type="button"
              className="text-sky-400 underline"
              onClick={() => void videos.refetch()}
            >
              Tekrar dene
            </button>
          </div>
        ) : items.length === 0 ? (
          <p
            role="status"
            className="rounded-xl border border-border bg-card p-5 text-muted-foreground"
          >
            Bu filtrelerle eşleşen yayınlanmış video bulunamadı.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((video) => (
                <Link
                  key={video.id}
                  to={`/watch/${video.id}`}
                  className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-sky-500/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex aspect-video items-center justify-center bg-secondary">
                    <Clapperboard aria-hidden="true" className="size-10 text-muted-foreground" />
                  </div>
                  <div className="space-y-2 p-4">
                    <h3 className="line-clamp-2 font-semibold group-hover:text-sky-400">
                      {video.title}
                    </h3>
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{durationLabel(video.durationSeconds)}</span>
                      <span>
                        {video.publishedAt
                          ? new Date(video.publishedAt).toLocaleDateString('tr-TR')
                          : ''}
                      </span>
                    </div>
                    {video.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {video.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {videos.hasNextPage && (
              <button
                type="button"
                disabled={videos.isFetchingNextPage}
                onClick={() => void videos.fetchNextPage()}
                className="rounded-lg border border-border px-5 py-2 font-semibold hover:bg-secondary disabled:opacity-60"
              >
                {videos.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla video'}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
