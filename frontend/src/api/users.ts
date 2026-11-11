import { API_URL, handleResponse, jsonInit } from "./config";
import { User, UserRole } from "../types/auth";

const BASE_URL = `${API_URL}/api/users`;

// Khusus admin (server menolak dengan 403 untuk staff).
export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(BASE_URL);
  return handleResponse(res);
}

export async function createUser(body: { name: string; pin: string; role: UserRole }): Promise<User> {
  const res = await fetch(BASE_URL, jsonInit("POST", body));
  return handleResponse(res);
}

export async function updateUser(id: string, body: { active?: boolean; role?: UserRole; pin?: string }): Promise<User> {
  const res = await fetch(`${BASE_URL}/${id}`, jsonInit("PATCH", body));
  return handleResponse(res);
}
