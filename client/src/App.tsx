import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queries';
import { SiteLayout } from './components/SiteLayout';
import { Skeleton } from './components/ui/Feedback';
import { HomePage } from './pages/HomePage';
import { BookingPage } from './pages/BookingPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ManageBookingPage } from './pages/ManageBookingPage';
import { NotFoundPage } from './pages/NotFoundPage';

// The admin area is code-split so patients never download it.
const AdminLayout = lazy(() => import('./components/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const LoginPage = lazy(() => import('./pages/admin/LoginPage').then((m) => ({ default: m.LoginPage })));
const OverviewPage = lazy(() => import('./pages/admin/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const AppointmentsPage = lazy(() => import('./pages/admin/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })));
const ServicesPage = lazy(() => import('./pages/admin/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const DoctorsPage = lazy(() => import('./pages/admin/DoctorsPage').then((m) => ({ default: m.DoctorsPage })));

function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<SiteLayout />}>
              <Route index element={<HomePage />} />
              <Route path="book" element={<BookingPage />} />
              <Route path="book/confirmed/:reference" element={<ConfirmationPage />} />
              <Route path="manage" element={<ManageBookingPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="admin/login" element={<LoginPage />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="appointments" element={<AppointmentsPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="dentists" element={<DoctorsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: 'font-sans', style: { borderRadius: '14px' } }}
      />
    </QueryClientProvider>
  );
}
