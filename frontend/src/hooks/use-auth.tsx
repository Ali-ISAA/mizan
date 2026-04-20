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
