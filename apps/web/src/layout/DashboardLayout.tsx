import { Outlet } from 'react-router';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 sm:px-8 md:grid-cols-[220px_1fr]">
        <Sidebar />
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
