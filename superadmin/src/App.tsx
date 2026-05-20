import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./hooks/use-theme";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import Users from "./pages/Users";
import Tenants from "./pages/Tenants";
import Layout from "./components/Layout";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("sa_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout><Dashboard /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/documents"
            element={
              <RequireAuth>
                <Layout><Documents /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/documents/:id"
            element={
              <RequireAuth>
                <Layout><DocumentDetail /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/tenants"
            element={
              <RequireAuth>
                <Layout><Tenants /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/users"
            element={
              <RequireAuth>
                <Layout><Users /></Layout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  );
}
