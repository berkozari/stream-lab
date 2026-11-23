import { Route, Routes } from 'react-router';
import { DashboardLayout } from '@/layout/DashboardLayout';
import { MainLayout } from '@/layout/MainLayout';
import { CreatorDashboardPage } from '@/pages/creator/CreatorDashboardPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { HomePage } from '@/pages/home/HomePage';
import { VideoDetailPage } from '@/pages/videos/VideoDetailPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="watch/:videoId" element={<VideoDetailPage />} />
      </Route>
      <Route element={<DashboardLayout />}>
        <Route path="creator" element={<CreatorDashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
