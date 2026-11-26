import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { DashboardLayout } from '@/layout/DashboardLayout';
import { MainLayout } from '@/layout/MainLayout';
import { CreatorDashboardPage } from '@/pages/creator/CreatorDashboardPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { HomePage } from '@/pages/home/HomePage';

const VideoDetailPage = lazy(() =>
  import('@/pages/videos/VideoDetailPage').then((module) => ({ default: module.VideoDetailPage })),
);

const WatchHistoryPage = lazy(() =>
  import('@/pages/watch-history/WatchHistoryPage').then((module) => ({
    default: module.WatchHistoryPage,
  })),
);

export function AppRouter() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="watch/:videoId"
          element={
            <Suspense fallback={<p role="status">Oynatma sayfası yükleniyor…</p>}>
              <VideoDetailPage />
            </Suspense>
          }
        />
        <Route element={<ProtectedRoute />}>
          <Route
            path="continue-watching"
            element={
              <Suspense fallback={<p role="status">İzleme kayıtları yükleniyor…</p>}>
                <WatchHistoryPage mode="continue" />
              </Suspense>
            }
          />
          <Route
            path="history"
            element={
              <Suspense fallback={<p role="status">İzleme kayıtları yükleniyor…</p>}>
                <WatchHistoryPage mode="history" />
              </Suspense>
            }
          />
        </Route>
      </Route>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="creator" element={<CreatorDashboardPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
