import { Component, ErrorInfo, ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useAuth } from './auth/AuthContext';
import AppLayout from './components/AppLayout';
import ActivitiesPage from './pages/ActivitiesPage';
import ActivityNewPage from './pages/ActivityNewPage';
import ActivityEditPage from './pages/ActivityEditPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProfilePage from './pages/ProfilePage';
import CommunityPage from './pages/CommunityPage';
import CalendarPage from './pages/CalendarPage';
import SchedulePage from './pages/SchedulePage';
import ChatPage from './pages/ChatPage';
import WellbeingPage from './pages/WellbeingPage';
import AdminLayout from './components/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import { NotificationsProvider } from './notifications/NotificationsContext';
import LocalRemindersBridge from './notifications/LocalRemindersBridge';
import NativeAppBridge from './components/NativeAppBridge';
import NotesPage from './pages/NotesPage';
import SettingsPage from './pages/SettingsPage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" gutterBottom>
            Algo salió mal
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {this.state.error?.message || 'Ha ocurrido un error inesperado'}
          </Typography>
          <Button variant="contained" onClick={this.handleReset}>
            Volver a la aplicación
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.rol !== 'ADMIN') return <Navigate to="/access-denied" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <NativeAppBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route
        element={
          <ProtectedRoute>
            <NotificationsProvider>
              <LocalRemindersBridge />
              <AppLayout />
            </NotificationsProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        <Route path="activities/new" element={<ActivityNewPage />} />
        <Route path="activities/:id/edit" element={<ActivityEditPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="community" element={<CommunityPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="wellbeing" element={<WellbeingPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
      </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
