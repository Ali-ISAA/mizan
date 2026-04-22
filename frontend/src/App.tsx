import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/ui/app-layout';
import { AuthProvider } from '@/hooks/use-auth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Index from './pages/Index';
import Upload from './pages/Upload';
import Documents from './pages/Documents';
import DocumentDetail from './pages/DocumentDetail';
import Rules from './pages/Rules';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Index />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Upload />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Documents />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents/:documentId"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <DocumentDetail />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/rules"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Rules />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Reports />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Settings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
