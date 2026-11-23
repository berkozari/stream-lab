import { Home, Video } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const links = [
  { to: '/creator', label: 'Genel görünüm', icon: Home },
  { to: '/', label: 'Video keşfet', icon: Video },
] as const;

export function Sidebar() {
  return (
    <aside
      aria-label="İçerik paneli menüsü"
      className="rounded-xl border border-border bg-card p-3 md:self-start"
    >
      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Creator
      </p>
      <nav className="flex gap-2 md:flex-col">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
                isActive && 'bg-secondary text-foreground',
              )
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
