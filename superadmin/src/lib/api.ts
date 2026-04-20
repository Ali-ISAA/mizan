import axios from "axios";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001/api/v1";
export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(cfg => {
  const t = localStorage.getItem("sa_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 403) {
      localStorage.removeItem("sa_token");
      window.location.href = "/login";
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);
