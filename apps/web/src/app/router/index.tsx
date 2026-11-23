import { Route, Routes } from 'react-router';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
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
