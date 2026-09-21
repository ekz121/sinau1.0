import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'

// Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

// Route-level code splitting keeps the login shell and first paint lightweight.
const StudentLayout = lazy(() => import('./layouts/StudentLayout'))
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const EmailVerifiedPage = lazy(() => import('./pages/auth/EmailVerifiedPage'))
const AdminLoginPage = lazy(() => import('./pages/auth/AdminLoginPage'))
const ExplorePage = lazy(() => import('./pages/student/ExplorePage'))
const VideoDetailPage = lazy(() => import('./pages/student/VideoDetailPage'))
const WalletPage = lazy(() => import('./pages/student/WalletPage'))
const UploadPage = lazy(() => import('./pages/student/UploadPage'))
const DashboardPage = lazy(() => import('./pages/student/DashboardPage'))
const ProfilePage = lazy(() => import('./pages/student/ProfilePage'))
const HistoryPage = lazy(() => import('./pages/student/HistoryPage'))
const CreatorProfilePage = lazy(() => import('./pages/student/CreatorProfilePage'))
const VideoReviewPage = lazy(() => import('./pages/admin/VideoReviewPage'))
const AllVideosPage = lazy(() => import('./pages/admin/AllVideosPage'))
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'))
const TransactionMonitorPage = lazy(() => import('./pages/admin/TransactionMonitorPage'))
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/admin/settings/SettingsPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-5" aria-label="Memuat halaman">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="skeleton h-16 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

const routes = [
  // ── Auth Routes ──────────────────────────────────────────
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/lupa-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/auth/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/auth/verified',
    element: <EmailVerifiedPage />,
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },

  // ── Student Portal ────────────────────────────────────────
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <StudentLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ExplorePage /> },
      { path: 'video/:id', element: <VideoDetailPage /> },
      { path: 'creator/:id', element: <CreatorProfilePage /> },
      { path: 'wallet', element: <WalletPage /> },
      { path: 'upload', element: <UploadPage /> },
      { path: 'studio', element: <DashboardPage /> },
      { path: 'profil', element: <ProfilePage /> },
      { path: 'riwayat', element: <HistoryPage /> },
    ],
  },

  // ── Admin Portal ──────────────────────────────────────────
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'review', element: <VideoReviewPage /> },
      { path: 'videos', element: <AllVideosPage /> },
      { path: 'users', element: <UserManagementPage /> },
      { path: 'transaksi', element: <TransactionMonitorPage /> },
      { path: 'laporan', element: <ReportsPage /> },
      { path: 'pengaturan', element: <SettingsPage /> },
      // Legacy routes redirect to new settings
      { path: 'pengaturan/qris', element: <SettingsPage /> },
      { path: 'pengaturan/kategori', element: <SettingsPage /> },
    ],
  },

  // ── Fallback ──────────────────────────────────────────────
  { path: '*', element: <Navigate to="/" replace /> },
]

const configuredBase = import.meta.env.BASE_URL.replace(/\/$/, '')
const router = createBrowserRouter(routes, {
  basename: configuredBase || '/',
})

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    const cleanup = init()
    return cleanup
  }, [init])

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: '14px',
            borderRadius: '12px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: { primary: '#059669', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#DC2626', secondary: '#fff' },
          },
        }}
      />
    </>
  )
}
