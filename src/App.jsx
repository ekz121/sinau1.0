import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'

// Layouts
import StudentLayout from './layouts/StudentLayout'
import AdminLayout from './layouts/AdminLayout'

// Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

// Auth pages
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import EmailVerifiedPage from './pages/auth/EmailVerifiedPage'
import AdminLoginPage from './pages/auth/AdminLoginPage'

// Student pages
import ExplorePage from './pages/student/ExplorePage'
import VideoDetailPage from './pages/student/VideoDetailPage'
import WalletPage from './pages/student/WalletPage'
import UploadPage from './pages/student/UploadPage'
import DashboardPage from './pages/student/DashboardPage'
import ProfilePage from './pages/student/ProfilePage'
import HistoryPage from './pages/student/HistoryPage'

// Admin pages
import VideoReviewPage from './pages/admin/VideoReviewPage'
import AllVideosPage from './pages/admin/AllVideosPage'
import UserManagementPage from './pages/admin/UserManagementPage'
import TransactionMonitorPage from './pages/admin/TransactionMonitorPage'
import ReportsPage from './pages/admin/ReportsPage'
import SettingsPage from './pages/admin/settings/SettingsPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'

// Student pages (extra)
import CreatorProfilePage from './pages/student/CreatorProfilePage'

const router = createBrowserRouter([
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
])

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    const cleanup = init()
    return cleanup
  }, [init])

  return (
    <>
      <RouterProvider router={router} />
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
