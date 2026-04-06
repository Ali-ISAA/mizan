import axios from "axios";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001/api/v1";
export const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem("sa_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
