/** Satu baris riwayat aktivitas (GET /api/activity). */
export interface ActivityItem {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  /** { label field: [nilai lama, nilai baru] } */
  changes: Record<string, [unknown, unknown]> | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  hasMore: boolean;
}

export interface ActivityUser {
  id: string;
  name: string;
  deleted: boolean;
}

/** Jumlah data yang akan hilang saat reset (GET /api/admin/summary). */
export interface DataSummary {
  ledger: number;
  greens: number;
  blends: number;
  packs: number;
  products: number;
  activity: number;
  phrase: string;
}
