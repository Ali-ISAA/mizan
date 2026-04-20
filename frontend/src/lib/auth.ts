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
