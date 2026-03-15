import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
  role: string | null;
  tenantId: string | null;
  setAuth: (data: { access_token: string; refresh_token: string; user_id: string; email: string; role: string; tenant_id: string }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      email: null,
      role: null,
      tenantId: null,
      setAuth: (data) => {
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user_id, email: data.email, role: data.role, tenantId: data.tenant_id });
      },
      clearAuth: () => {
        localStorage.clear();
        set({ accessToken: null, refreshToken: null, userId: null, email: null, role: null, tenantId: null });
      },
    }),
    { name: "mizan-auth" }
  )
);
