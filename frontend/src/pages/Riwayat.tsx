// Riwayat aktivitas: siapa mengubah apa (data master, transaksi, pengaturan, akun, reset data).
// Semua peran boleh melihat. Login/logout tidak dicatat. Data dicatat server di transaksi yang sama
// dengan perubahannya (backend/src/lib/activity.ts).

import { useEffect, useState } from "react";
import { fetchActivity, fetchActivityUsers } from "../api/activity";
import { Loading, Panel, Pill, type Tone } from "../components/ui";
import type { ActivityItem, ActivityUser } from "../types/activity";
import { nf } from "../utils/format";

const PAGE = 50;

const ENTITY_FILTERS: [string, string][] = [
  ["", "Semua data"], ["master", "Data master"], ["ledger", "Transaksi"], ["config", "Pengaturan"], ["users", "Akun"], ["data", "Reset data"],
];

const ACTION: Record<string, [string, Tone | undefined]> = {
  create: ["Tambah", "ok"], update: ["Ubah", "bean"], delete: ["Hapus", "bad"], archive: ["Arsip", "warn"], restore: ["Aktifkan", "ok"],
  mark_paid: ["Lunas", "ok"], pin: ["PIN", "roast"], rename: ["Ganti nama", "bean"], reset: ["Reset data", "bad"],
};

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const val = (v: unknown) => (v == null || v === "" ? "–" : typeof v === "number" ? nf(v, 3) : String(v));

export default function Riwayat() {
  const [userId, setUserId] = useState("");
  const [entity, setEntity] = useState("");
  const [users, setUsers] = useState<ActivityUser[]>([]);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchActivityUsers().then(setUsers).catch(() => undefined); }, []);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    fetchActivity({ userId, entity, limit: PAGE })
      .then((p) => { if (alive) { setItems(p.items); setHasMore(p.hasMore); } })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [userId, entity]);

  async function more() {
    if (!items?.length) return;
    setBusy(true);
    try {
      const p = await fetchActivity({ userId, entity, limit: PAGE, before: items[items.length - 1].at });
      setItems([...items, ...p.items]);
      setHasMore(p.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Kelompokkan per hari, urutan tetap terbaru dulu.
  const groups: [string, ActivityItem[]][] = [];
  for (const it of items || []) {
    const k = dayKey(it.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === k) last[1].push(it);
    else groups.push([k, [it]]);
  }

  return (
    <Panel
      title="Riwayat aktivitas"
      hint={
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" aria-label="Filter akun" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Semua akun</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.deleted ? " (dihapus)" : ""}</option>)}
          </select>
          <select className="input w-auto" aria-label="Filter jenis data" value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITY_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      }
    >
      {!items ? (
        <Loading error={error} />
      ) : !items.length ? (
        <p className="empty">Belum ada aktivitas{userId || entity ? " untuk filter ini" : ""}.</p>
      ) : (
        <>
          {groups.map(([day, list]) => (
            <section key={day} className="mb-3">
              <h3 className="hint pb-1 font-semibold">{day}</h3>
              <div className="feed">
                {list.map((it) => {
                  const [label, tone] = ACTION[it.action] || [it.action, undefined];
                  return (
                    <div key={it.id} className="it">
                      <Pill tone={tone}>{label}</Pill>
                      <div className="txt">
                        {it.summary}
                        {it.changes && (
                          <ul className="meta mt-1 grid gap-0.5">
                            {Object.entries(it.changes).map(([field, [a, b]]) => (
                              <li key={field}><b>{field}:</b> {val(a)} → {val(b)}</li>
                            ))}
                          </ul>
                        )}
                        <div className="meta">{time(it.at)} · {it.userName}</div>
                      </div>
                      <span />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {error && <p className="notice">{error}</p>}
          {hasMore && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={more}>{busy ? "Memuat…" : "Muat lebih banyak"}</button>
          )}
        </>
      )}
    </Panel>
  );
}
