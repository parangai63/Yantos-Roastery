import { API_URL, handleResponse, jsonInit } from "./config";
import { AuthSession, UnlockedUser } from "../types/auth";

const BASE_URL = `${API_URL}/api/auth`;

export async function checkAuthStatus(): Promise<{ hasAnyUser: boolean }> {
  const res = await fetch(`${BASE_URL}/status`);
  return handleResponse(res);
}

/** Seperti parang-ops: cukup PIN, server yang mencari akun pemiliknya. */
export async function verifyPin(pin: string): Promise<AuthSession> {
  const res = await fetch(`${BASE_URL}/verify-pin`, jsonInit("POST", { pin }));
  return handleResponse(res);
}

export async function fetchMe(): Promise<UnlockedUser> {
  const res = await fetch(`${BASE_URL}/me`);
  return handleResponse(res);
}

/** Token dikirim eksplisit karena dipanggil tepat saat sesi dihapus dari sessionStorage. */
export async function logout(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  return handleResponse(res);
}

export async function changePin(oldPin: string, newPin: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/pin`, jsonInit("PUT", { oldPin, newPin }));
  return handleResponse(res);
}
