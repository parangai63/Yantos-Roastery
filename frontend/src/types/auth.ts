export type UserRole = "admin" | "staff";

/** Akun yang sedang membuka aplikasi (hasil POST /api/auth/verify-pin). */
export interface UnlockedUser {
  id: string;
  name: string;
  role: UserRole;
}

/** Disimpan di localStorage selama layar terbuka (lihat api/authInterceptor.ts). */
export interface AuthSession {
  token: string;
  user: UnlockedUser;
}

/** Baris daftar akun (GET /api/users, admin). */
export interface User extends UnlockedUser {
  active: boolean;
  createdAt: string;
}
