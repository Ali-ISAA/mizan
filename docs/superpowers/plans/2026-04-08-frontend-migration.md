# Frontend Migration & Build Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Each task is independently executable.

**Goal:** Migrate frontend from mizan-ai-web-app-main UI + design system into Mizan project, wire to real backend API, build out core user flow (upload → analysis → reports) with light/dark mode.

**Architecture:** 
- Copy full design system, components, and shells from mizan-ai-web-app-main (proven, production-ready UI)
- Replace auth mock with real JWT-based auth (login/register/refresh endpoints)
- Adapt routes to Mizan backend: projects instead of documents, analysis results pages, real API integration
- Preserve light/dark mode toggle, sidebar, header, chart components
- Build 3 new pages: Project Detail (upload), Analysis Results (tabbed), Reports

**Tech Stack:** React 19, TypeScript, Tailwind CSS, shadcn/ui, React Router, React Query, Zustand, Axios

---

## Chunk 1: Foundation & Setup

### Task 1: Backup current frontend, copy mizan-ai-web-app-main

**Files:**
- Delete: `frontend/src` (backup: `frontend/src.backup`)
- Create: Copy entire `C:\Personal\Projects\mizan-ai-web-app-main/src/**` → `frontend/src`
- Copy: `mizan-ai-web-app-main/package.json` → `frontend/package.json` (merge if needed)
- Copy: `mizan-ai-web-app-main/tailwind.config.ts` → `frontend/tailwind.config.ts`
- Copy: `mizan-ai-web-app-main/tsconfig.json` → `frontend/tsconfig.json`
- Copy: `mizan-ai-web-app-main/vite.config.ts` → `frontend/vite.config.ts`

- [ ] **Step 1: Backup current frontend**

```bash
cd c:/Personal/Projects/mizan/frontend
mv src src.backup
```

- [ ] **Step 2: Copy mizan-ai-web-app-main source**

```bash
cp -r c:/Personal/Projects/mizan-ai-web-app-main/src .
cp c:/Personal/Projects/mizan-ai-web-app-main/package.json .
cp c:/Personal/Projects/mizan-ai-web-app-main/tailwind.config.ts .
cp c:/Personal/Projects/mizan-ai-web-app-main/tsconfig.json .
cp c:/Personal/Projects/mizan-ai-web-app-main/vite.config.ts .
```

- [ ] **Step 3: Install dependencies**

```bash
cd c:/Personal/Projects/mizan/frontend
npm install
```

Expected: All dependencies installed successfully, no peer dependency warnings

- [ ] **Step 4: Verify app builds**

```bash
npm run build 2>&1 | head -20
```

Expected: Build completes without errors (warnings about unused imports OK for now)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: copy mizan-ai-web-app-main UI as foundation"
```

---

### Task 2: Update API client to use real Mizan backend

**Files:**
- Modify: `frontend/src/lib/api.ts` → Replace mock with real Axios client
- Create: `frontend/src/lib/auth.ts` → Auth helpers (JWT, refresh token logic)

- [ ] **Step 1: Create new API client**

```typescript
// frontend/src/lib/api.ts
import axios from 'axios';
import { useAuthStore } from '@/hooks/use-auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: add JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 + refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

- [ ] **Step 2: Create auth helpers**

```typescript
// frontend/src/lib/auth.ts
import { jwtDecode } from 'jwt-decode';

export interface TokenPayload {
  sub: string;
  tenant: string;
  exp: number;
}

export function decodeToken(token: string): TokenPayload {
  return jwtDecode(token);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeToken(token);
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('access_token');
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}
```

- [ ] **Step 3: Update package.json with jwt-decode**

Add to `frontend/package.json` dependencies:

```json
{
  "dependencies": {
    "jwt-decode": "^4.0.0"
  }
}
```

```bash
cd c:/Personal/Projects/mizan/frontend
npm install jwt-decode
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/lib/auth.ts package.json
git commit -m "feat: wire real API client with JWT auth"
```

---

### Task 3: Update auth hook to use real backend

**Files:**
- Modify: `frontend/src/hooks/use-auth.tsx` → Replace mock with real endpoints

- [ ] **Step 1: Replace auth hook**

```typescript
// frontend/src/hooks/use-auth.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { setTokens, clearTokens, getStoredToken } from '@/lib/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  userEmail: string | null;
  tenantId: string | null;
  userId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string, org_name: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check if user is already logged in on mount
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      const email = localStorage.getItem('user_email');
      const tenant = localStorage.getItem('tenant_id');
      const id = localStorage.getItem('user_id');
      setIsAuthenticated(true);
      setUserEmail(email);
      setTenantId(tenant);
      setUserId(id);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setTokens(data.access_token, data.refresh_token);
      localStorage.setItem('user_email', data.email);
      localStorage.setItem('tenant_id', data.tenant_id);
      localStorage.setItem('user_id', data.user_id);
      setIsAuthenticated(true);
      setUserEmail(data.email);
      setTenantId(data.tenant_id);
      setUserId(data.user_id);
      navigate('/');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, full_name: string, org_name: string) => {
    try {
      const { data } = await api.post('/auth/register', {
        email,
        password,
        full_name,
        org_name,
      });
      setTokens(data.access_token, data.refresh_token);
      localStorage.setItem('user_email', data.email);
      localStorage.setItem('tenant_id', data.tenant_id);
      localStorage.setItem('user_id', data.user_id);
      setIsAuthenticated(true);
      setUserEmail(data.email);
      setTenantId(data.tenant_id);
      setUserId(data.user_id);
      navigate('/');
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    clearTokens();
    localStorage.removeItem('user_email');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('user_id');
    setIsAuthenticated(false);
    setUserEmail(null);
    setTenantId(null);
    setUserId(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, userEmail, tenantId, userId, login, register, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 2: Update Login page**

```typescript
// frontend/src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-accent-600 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle>Mizan</CardTitle>
          <CardDescription>Compliance Analysis Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-critical">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-text-muted">
              Don't have an account?{' '}
              <a href="/register" className="text-accent-600 hover:underline">
                Register
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create Register page**

```typescript
// frontend/src/pages/Register.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function Register() {
  const [form, setForm] = useState({
    full_name: '',
    org_name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(form.email, form.password, form.full_name, form.org_name);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-accent-600 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle>Create Account</CardTitle>
          <CardDescription>Join Mizan for compliance analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <Input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                placeholder="Your name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Organization</label>
              <Input
                name="org_name"
                value={form.org_name}
                onChange={handleChange}
                placeholder="Your organization"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-critical">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
            <p className="text-center text-sm text-text-muted">
              Already have an account?{' '}
              <a href="/login" className="text-accent-600 hover:underline">
                Sign in
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-auth.tsx src/pages/Login.tsx src/pages/Register.tsx src/lib/auth.ts
git commit -m "feat: integrate real JWT auth with backend"
```

---

## Chunk 2: Core Pages & Routing

### Task 4: Update App routing and layout

**Files:**
- Modify: `frontend/src/App.tsx` → Update routes for Mizan structure
- Modify: `frontend/src/components/app-sidebar.tsx` → Update navigation items

- [ ] **Step 1: Update App.tsx routes**

```typescript
// frontend/src/App.tsx
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
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import AnalysisResults from './pages/AnalysisResults';
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
              path="/projects"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Projects />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ProjectDetail />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/results"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <AnalysisResults />
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
```

- [ ] **Step 2: Update sidebar navigation**

```typescript
// frontend/src/components/app-sidebar.tsx
import { Home, Upload, FolderOpen, BarChart3, Settings } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const items = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'Projects', url: '/projects', icon: FolderOpen },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent
        className="relative"
        style={{
          background: 'var(--gradient-sidebar)',
        }}
      >
        <div className="px-4 py-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 shadow-glow-blue">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <h2 className="text-base font-semibold text-sidebar-foreground tracking-tight">
                Mizan
              </h2>
              <p className="text-xs text-sidebar-foreground/60 font-medium">
                Compliance Platform
              </p>
            </div>
          </div>
        </div>

        <SidebarGroup className="px-3 py-4">
          <SidebarGroupLabel className="px-3 text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-2">
            Navigation
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`
                          flex items-center gap-3 rounded-lg px-3 py-2.5
                          transition-all duration-200
                          group relative
                          ${
                            active
                              ? 'bg-sidebar-accent text-accent-600 font-medium shadow-sm'
                              : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
                          }
                        `}
                      >
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent-600 rounded-r-full" />
                        )}
                        <item.icon
                          className={`
                            h-4 w-4 flex-shrink-0 transition-all duration-200
                            ${
                              active
                                ? 'text-accent-600 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                                : 'group-hover:scale-110'
                            }
                          `}
                        />
                        <span className="text-sm group-data-[collapsible=icon]:hidden">
                          {item.title}
                        </span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/app-sidebar.tsx
git commit -m "feat: update routing and navigation for projects-based flow"
```

---

### Task 5: Create Projects page (list of projects)

**Files:**
- Create: `frontend/src/pages/Projects.tsx`
- Create: `frontend/src/hooks/useProjects.ts` → Query hook for projects API

- [ ] **Step 1: Create useProjects hook**

```typescript
// frontend/src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  overall_score: number | null;
  requirements_count: number;
  met_count: number;
  partial_count: number;
  not_met_count: number;
  created_at: string;
  updated_at: string;
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await api.get('/projects');
      return data;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; description?: string }) => {
      const { data } = await api.post('/projects', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

- [ ] **Step 2: Create Projects page**

```typescript
// frontend/src/pages/Projects.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjects, useCreateProject, useDeleteProject } from '@/hooks/useProjects';

export default function Projects() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: projects = [], isLoading } = useProjects();
  const createMutation = useCreateProject();
  const deleteMutation = useDeleteProject();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ name, description: description || undefined });
      setName('');
      setDescription('');
      setShowCreate(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleDelete = (projectId: string) => {
    if (window.confirm('Are you sure?')) {
      deleteMutation.mutate(projectId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-success/10 text-success';
      case 'processing':
        return 'bg-warning/10 text-warning';
      case 'failed':
        return 'bg-critical/10 text-critical';
      default:
        return 'bg-text-muted/10 text-text-muted';
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-text-muted';
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-critical';
  };

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-text-secondary mt-2">Manage your compliance analyses</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {showCreate && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Create New Project</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Project Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ISO 27001 Audit"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the analysis"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <p className="text-text-secondary">Loading projects...</p>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 text-text-muted" />
          <h3 className="font-semibold text-lg">No projects yet</h3>
          <p className="text-text-secondary mt-2">Create your first project to start analyzing compliance</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <Link
                to={project.status === 'complete' ? `/projects/${project.id}/results` : `/projects/${project.id}`}
                className="flex items-center gap-4 flex-1"
              >
                <FolderOpen className="h-5 w-5 text-text-muted" />
                <div className="flex-1">
                  <h3 className="font-semibold">{project.name}</h3>
                  {project.description && <p className="text-sm text-text-secondary">{project.description}</p>}
                </div>
              </Link>
              <div className="flex items-center gap-3">
                {project.overall_score !== null && (
                  <span className={`text-lg font-semibold ${getScoreColor(project.overall_score)}`}>
                    {project.overall_score.toFixed(1)}%
                  </span>
                )}
                <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                <button
                  onClick={() => handleDelete(project.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-critical/10 rounded transition-all"
                >
                  <Trash2 className="h-4 w-4 text-critical" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Projects.tsx src/hooks/useProjects.ts
git commit -m "feat: add projects list page with real API"
```

---

### Task 6: Create ProjectDetail page (upload documents)

**Files:**
- Create: `frontend/src/pages/ProjectDetail.tsx`
- Create: `frontend/src/hooks/useProject.ts` → Query hook for single project
- Create: `frontend/src/hooks/useDocuments.ts` → Mutations for document upload

- [ ] **Step 1: Create useProject hook**

```typescript
// frontend/src/hooks/useProject.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  overall_score: number | null;
  created_at: string;
}

export function useProject(projectId: string) {
  return useQuery<ProjectDetail>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}`);
      return data;
    },
  });
}
```

- [ ] **Step 2: Create useDocuments hook**

```typescript
// frontend/src/hooks/useDocuments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Document {
  id: string;
  role: 'requirement' | 'compliance';
  filename: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  page_count: number | null;
  word_count: number | null;
}

export function useProjectDocuments(projectId: string) {
  return useQuery<Document[]>({
    queryKey: ['documents', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      return data;
    },
    refetchInterval: 3000,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      role,
      file,
    }: {
      projectId: string;
      role: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('role', role);
      formData.append('file', file);
      const { data } = await api.post(`/projects/${projectId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.projectId] });
    },
  });
}

export function useAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data } = await api.post(`/projects/${projectId}/analyze`);
      return data;
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}
```

- [ ] **Step 3: Create ProjectDetail page**

```typescript
// frontend/src/pages/ProjectDetail.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, FileText, Play, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProject } from '@/hooks/useProject';
import { useProjectDocuments, useUploadDocument, useAnalyze } from '@/hooks/useDocuments';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const requirementInputRef = useRef<HTMLInputElement>(null);
  const complianceInputRef = useRef<HTMLInputElement>(null);

  if (!projectId) {
    return <div>Project not found</div>;
  }

  const { data: project } = useProject(projectId);
  const { data: documents = [] } = useProjectDocuments(projectId);
  const uploadMutation = useUploadDocument();
  const analyzeMutation = useAnalyze();

  const docA = documents.find((d) => d.role === 'requirement');
  const docB = documents.find((d) => d.role === 'compliance');
  const bothReady = docA?.processing_status === 'completed' && docB?.processing_status === 'completed';

  useEffect(() => {
    if (project?.status === 'complete') {
      navigate(`/projects/${projectId}/results`);
    }
  }, [project?.status, projectId, navigate]);

  const handleFileSelect = (role: string, file: File) => {
    uploadMutation.mutate({ projectId, role, file });
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate(projectId);
  };

  return (
    <div className="flex-1 space-y-6 p-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">{project?.name || 'Loading...'}</h1>
        {project?.description && <p className="text-text-secondary mt-2">{project.description}</p>}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Upload Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Requirement Document */}
          <Card className="p-6 border-2 border-dashed">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-text-muted" />
              <h3 className="font-semibold">Requirements Document</h3>
              <p className="text-sm text-text-secondary mt-1">
                Upload the policy, RFP, or regulation document
              </p>
            </div>
            {docA ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{docA.filename}</p>
                <div className="flex items-center gap-2">
                  {docA.processing_status === 'completed' && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-xs text-success">Ready</span>
                    </>
                  )}
                  {docA.processing_status === 'processing' && (
                    <>
                      <Clock className="h-4 w-4 text-warning animate-spin" />
                      <span className="text-xs text-warning">Processing...</span>
                    </>
                  )}
                  {docA.processing_status === 'failed' && (
                    <>
                      <AlertCircle className="h-4 w-4 text-critical" />
                      <span className="text-xs text-critical">Failed</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requirementInputRef.current?.click()}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full mt-4 gap-2"
                onClick={() => requirementInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
            )}
            <input
              ref={requirementInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => e.target.files?.[0] && handleFileSelect('requirement', e.target.files[0])}
            />
          </Card>

          {/* Compliance Document */}
          <Card className="p-6 border-2 border-dashed">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-text-muted" />
              <h3 className="font-semibold">Compliance Document</h3>
              <p className="text-sm text-text-secondary mt-1">
                Upload your response, policy, or report document
              </p>
            </div>
            {docB ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{docB.filename}</p>
                <div className="flex items-center gap-2">
                  {docB.processing_status === 'completed' && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-xs text-success">Ready</span>
                    </>
                  )}
                  {docB.processing_status === 'processing' && (
                    <>
                      <Clock className="h-4 w-4 text-warning animate-spin" />
                      <span className="text-xs text-warning">Processing...</span>
                    </>
                  )}
                  {docB.processing_status === 'failed' && (
                    <>
                      <AlertCircle className="h-4 w-4 text-critical" />
                      <span className="text-xs text-critical">Failed</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => complianceInputRef.current?.click()}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full mt-4 gap-2"
                onClick={() => complianceInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
            )}
            <input
              ref={complianceInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => e.target.files?.[0] && handleFileSelect('compliance', e.target.files[0])}
            />
          </Card>
        </div>
      </div>

      {/* Analysis Trigger */}
      <Card className="p-6 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Run Compliance Analysis</h3>
          <p className="text-sm text-text-secondary mt-1">
            {!bothReady ? 'Both documents must be uploaded' : 'Ready to analyze'}
          </p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={!bothReady || analyzeMutation.isPending}
          className="gap-2"
        >
          {analyzeMutation.isPending ? (
            <>
              <Clock className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Analyze
            </>
          )}
        </Button>
      </Card>

      {project?.status === 'failed' && (
        <div className="bg-critical/10 border border-critical/30 rounded-lg p-4 flex items-center gap-2 text-critical">
          <AlertCircle className="h-4 w-4" />
          Analysis failed. Please try again or contact support.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProjectDetail.tsx src/hooks/useProject.ts src/hooks/useDocuments.ts
git commit -m "feat: add project detail page with document upload"
```

---

**[Chunk 3 continues with AnalysisResults, Reports, and Dashboard updates...]**

---

## Summary

This plan covers:
1. **Foundation** — Copy UI, wire real API client, implement JWT auth
2. **Core pages** — Projects list, ProjectDetail (upload), AnalysisResults (new), Reports
3. **Dashboard** — Wire real data from `/projects` endpoint
4. **Light/dark mode** — Already included from mizan-ai-web-app-main

**Total tasks:** 10+ (split into 3 chunks, each ~2-3 hours of focused development)

**Key file structure:**
```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.tsx (wired to real auth)
│   │   ├── Register.tsx (new)
│   │   ├── Index.tsx (dashboard — wire to projects)
│   │   ├── Projects.tsx (list — real API)
│   │   ├── ProjectDetail.tsx (new — upload flow)
│   │   ├── AnalysisResults.tsx (new — tabbed results)
│   │   ├── Reports.tsx (wire to real export)
│   │   └── Settings.tsx (existing)
│   ├── hooks/
│   │   ├── use-auth.tsx (real JWT)
│   │   ├── useProjects.ts (new)
│   │   ├── useProject.ts (new)
│   │   ├── useDocuments.ts (new)
│   │   └── use-theme.tsx (existing)
│   ├── lib/
│   │   ├── api.ts (real Axios client)
│   │   └── auth.ts (JWT helpers)
│   └── components/ (all from source, no changes)
```
