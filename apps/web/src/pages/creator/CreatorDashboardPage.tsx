import { AlertCircle, UploadCloud } from 'lucide-react';

export function CreatorDashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
          Creator Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">İçerik yönetimi</h1>
        <p className="mt-3 text-muted-foreground">Video yönetim alanının arayüz iskeleti hazır.</p>
      </div>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="size-4" aria-hidden="true" />
          Oturum doğrulaması etkin
        </div>
        <p className="mt-2">
          Bu sayfaya yalnızca giriş yapmış kullanıcılar ulaşabilir. İçerik yönetimi işlevleri
          sonraki milestone'larda eklenecek.
        </p>
      </div>
      <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <UploadCloud aria-hidden="true" className="size-9 text-sky-400" />
        <h2 className="mt-4 text-lg font-semibold">Henüz video bulunmuyor</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Video oluşturma ve upload işlevleri sonraki milestone'larda açılacak.
        </p>
      </div>
    </section>
  );
}
