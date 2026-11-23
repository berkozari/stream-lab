import { Outlet } from 'react-router';
import { Header } from '@/components/layout/Header';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
