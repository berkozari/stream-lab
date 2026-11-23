import { Clapperboard, LayoutDashboard } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { AuthHeaderActions } from '@/features/auth/components/AuthHeaderActions';

export function Header() {
  return (
    <header className="border-b border-border/70 bg-card/70 backdrop-blur">
      <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Clapperboard aria-hidden="true" className="size-5 text-sky-400" />
          StreamLab
        </Link>
        <nav aria-label="Ana navigasyon" className="flex items-center gap-2 text-sm sm:gap-5">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-muted-foreground hover:text-foreground',
                isActive && 'bg-secondary text-foreground',
              )
            }
          >
            Keşfet
          </NavLink>
          <NavLink
            to="/creator"
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:text-foreground',
                isActive && 'bg-secondary text-foreground',
              )
            }
          >
            <LayoutDashboard aria-hidden="true" className="size-4" />
            İçerik paneli
          </NavLink>
        </nav>
        <AuthHeaderActions />
      </div>
    </header>
  );
}
