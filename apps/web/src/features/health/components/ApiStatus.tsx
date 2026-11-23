import { Activity, CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { useHealth } from '../hooks/useHealth';

export function ApiStatus() {
  const query = useHealth();
  const online = query.isSuccess && query.data.status === 'ok';
  const checking = query.isPending;
  const Icon = checking ? CircleHelp : online ? CircleCheck : CircleX;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Activity aria-hidden="true" className="size-5 text-sky-400" />
        <div>
          <p className="font-medium">Express API bağlantısı</p>
          <p className="text-xs text-muted-foreground">GET /api/v1/health · TanStack Query</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 text-sm">
        <Icon
          aria-hidden="true"
          className={online ? 'size-4 text-emerald-400' : 'size-4 text-amber-400'}
        />
        {checking ? 'Kontrol ediliyor' : online ? 'Bağlı' : 'Bağlantı yok'}
      </span>
    </div>
  );
}
