import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-8 text-center text-foreground">
      <div>
        <p className="text-sm font-semibold tracking-widest text-sky-400">404</p>
        <h1 className="mt-3 text-3xl font-semibold">Sayfa bulunamadı</h1>
        <p className="mt-3 text-muted-foreground">Aradığın adres henüz mevcut değil.</p>
        <Link
          className="mt-6 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          to="/"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}
