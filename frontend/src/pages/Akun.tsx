// Akun & PIN. Semua pengguna bisa mengganti nama & PIN sendiri dan menghapus akun sendiri (wajib PIN).
// Admin juga bisa menambah akun, mengganti nama, mengubah peran, menonaktifkan, mereset PIN, dan
// menghapus akun lain, serta mereset seluruh data (server tetap memeriksa hak admin).
// PIN wajib unik antar akun karena login hanya dengan PIN (tanpa memilih nama).
// Hapus akun = soft delete: akun hilang dari daftar & tidak bisa masuk, catatan lamanya tetap ada.

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { changePin, deleteMe, renameMe } from "../api/auth";
import { fetchBackup, fetchDataSummary, resetAllData } from "../api/admin";
import { createUser, deleteUser, fetchUsers, updateUser } from "../api/users";
import { useToast } from "../components/Toast";
import { DeleteButton, Loading, Panel, Pill } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useAuth } from "../context/AuthContext";
import type { DataSummary } from "../types/activity";
import type { User, UserRole } from "../types/auth";
import { nf } from "../utils/format";

const PIN_RE = /^\d{4}$/;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function PinInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) {
  return (
    <input
      className="input"
      type="password"
      inputMode="numeric"
      autoComplete="new-password"
      maxLength={4}
      pattern="\d{4}"
      placeholder="4 angka"
      aria-label={label}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      required
    />
  );
}

export default function Akun() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => fetchUsers().then((u) => { setUsers(u); setError(null); }).catch((e: Error) => setError(e.message));
  useEffect(() => { if (isAdmin) reload(); }, [isAdmin]);

  return (
    <div className="work">
      <div className="grid content-start gap-3.5">
        <Panel title="Nama saya" hint={user ? `${user.role === "admin" ? "Admin" : "Staf"}` : undefined}>
          <EditOwnName onDone={() => isAdmin && reload()} />
        </Panel>
        <Panel title="Ganti PIN saya">
          <ChangeOwnPin />
        </Panel>
        {isAdmin && (
          <Panel title="Tambah akun">
            <CreateUserForm onDone={reload} />
          </Panel>
        )}
        <Panel title="Hapus akun saya">
          <DeleteOwnAccount />
        </Panel>
      </div>
      <div className="grid content-start gap-3.5">
        {isAdmin ? (
          <Panel title={`Daftar akun${users ? " · " + users.length : ""}`}>
            {users ? <UserList users={users} selfId={user!.id} onChanged={reload} /> : <Loading error={error} />}
          </Panel>
        ) : (
          <Panel title="Daftar akun">
            <p className="empty">Hanya admin yang bisa menambah atau mengelola akun.</p>
          </Panel>
        )}
        {isAdmin && (
          <Panel title="Zona bahaya · Reset data">
            <ResetData />
          </Panel>
        )}
      </div>
    </div>
  );
}

function EditOwnName({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { user, updateSelf } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(user?.name || ""); }, [user?.name]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const next = name.trim();
    if (!next) return toast("Isi nama dulu.", true);
    if (next === user?.name) return toast("Nama belum diubah.", true);
    setBusy(true);
    try {
      updateSelf(await renameMe(next));
      toast("Nama berhasil diganti. Transaksi lama tetap memakai nama saat dicatat.");
      onDone();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Nama tampilan"><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required /></Field>
      <button type="submit" className="btn" disabled={busy || name.trim() === user?.name}>{busy ? "Menyimpan…" : "Simpan nama"}</button>
    </form>
  );
}

function ChangeOwnPin() {
  const toast = useToast();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!PIN_RE.test(newPin)) return toast("PIN baru harus 4 angka.", true);
    if (newPin !== confirm) return toast("Ulangi PIN baru belum sama.", true);
    if (newPin === oldPin) return toast("PIN baru sama dengan PIN lama.", true);
    setBusy(true);
    try {
      await changePin(oldPin, newPin);
      toast("PIN berhasil diganti.");
      setOldPin(""); setNewPin(""); setConfirm("");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="PIN lama"><PinInput value={oldPin} onChange={setOldPin} /></Field>
      <div className="row">
        <Field label="PIN baru"><PinInput value={newPin} onChange={setNewPin} /></Field>
        <Field label="Ulangi PIN baru"><PinInput value={confirm} onChange={setConfirm} /></Field>
      </div>
      <button type="submit" className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Ganti PIN"}</button>
    </form>
  );
}

function DeleteOwnAccount() {
  const toast = useToast();
  const { lock } = useAuth();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!PIN_RE.test(pin)) return toast("Masukkan PIN Anda (4 angka).", true);
    setBusy(true);
    try {
      await deleteMe(pin);
      toast("Akun Anda sudah dihapus.");
      lock();
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="grid gap-2">
        <p className="hint">Akun tidak bisa dipakai masuk lagi. Transaksi dan riwayat yang Anda catat tetap tersimpan atas nama Anda.</p>
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => setOpen(true)}>Hapus akun saya…</button>
      </div>
    );
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="notice">Masukkan PIN Anda untuk memastikan. Setelah dihapus Anda langsung keluar dari semua perangkat.</p>
      <Field label="PIN saya"><PinInput value={pin} onChange={setPin} autoFocus /></Field>
      <div className="actions">
        <button type="submit" className="btn btn-confirm" disabled={busy || !PIN_RE.test(pin)}>{busy ? "Menghapus…" : "Ya, hapus akun saya"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setPin(""); }}>Batal</button>
      </div>
    </form>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return toast("Isi nama dulu.", true);
    if (!PIN_RE.test(pin)) return toast("PIN harus 4 angka.", true);
    setBusy(true);
    try {
      const u = await createUser({ name: name.trim(), pin, role });
      toast(`Akun ${u.name} dibuat. Berikan PIN-nya ke yang bersangkutan.`);
      setName(""); setPin(""); setRole("staff");
      onDone();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Nama"><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nama staf" required /></Field>
      <div className="row">
        <Field label="PIN (4 angka, unik)"><PinInput value={pin} onChange={setPin} /></Field>
        <Field label="Peran">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="staff">Staf</option>
            <option value="admin">Admin (bisa kelola akun)</option>
          </select>
        </Field>
      </div>
      <button type="submit" className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Tambah akun"}</button>
    </form>
  );
}

type Editing = { id: string; mode: "pin" | "name"; value: string } | null;

function UserList({ users, selfId, onChanged }: { users: User[]; selfId: string; onChanged: () => void }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const sorted = users.slice().sort((a, b) => Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name, "id"));

  async function run(u: User, fn: () => Promise<unknown>, msg: string) {
    setBusyId(u.id);
    try {
      await fn();
      toast(msg);
      onChanged();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusyId(null);
    }
  }
  const patch = (u: User, body: Parameters<typeof updateUser>[1], msg: string) => run(u, () => updateUser(u.id, body), msg);

  async function submitEdit(ev: FormEvent, u: User) {
    ev.preventDefault();
    if (!editing) return;
    if (editing.mode === "pin") {
      if (!PIN_RE.test(editing.value)) return toast("PIN harus 4 angka.", true);
      if (await patch(u, { pin: editing.value }, `PIN ${u.name} direset. Sesinya di semua perangkat dikeluarkan.`)) setEditing(null);
    } else {
      const name = editing.value.trim();
      if (!name) return toast("Isi nama dulu.", true);
      if (name === u.name) return setEditing(null);
      if (await patch(u, { name }, `Nama ${u.name} diganti menjadi ${name}.`)) setEditing(null);
    }
  }

  return (
    <div className="tw">
      <table className="tbl">
        <tbody>
          {sorted.map((u) => {
            const self = u.id === selfId;
            const busy = busyId === u.id;
            const ed = editing?.id === u.id ? editing : null;
            return (
              <tr key={u.id} className={u.active ? "" : "muted"}>
                <td>
                  <b>{u.name}</b>{" "}
                  <Pill tone={u.role === "admin" ? "roast" : undefined}>{u.role === "admin" ? "Admin" : "Staf"}</Pill>
                  {!u.active && <> <Pill tone="bad">Nonaktif</Pill></>}
                  {self && <> <Pill tone="ok">Anda</Pill></>}
                  <span className="sub">Dibuat {new Date(u.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {ed && (
                    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(ev) => submitEdit(ev, u)}>
                      {ed.mode === "pin" ? (
                        <div className="w-[120px]">
                          <PinInput value={ed.value} onChange={(value) => setEditing({ ...ed, value })} label={`PIN baru untuk ${u.name}`} autoFocus />
                        </div>
                      ) : (
                        <input className="input w-[180px]" value={ed.value} maxLength={40} aria-label={`Nama baru untuk ${u.name}`} autoFocus
                          onChange={(e) => setEditing({ ...ed, value: e.target.value })} required />
                      )}
                      <button type="submit" className="btn btn-sm" disabled={busy}>{ed.mode === "pin" ? "Simpan PIN" : "Simpan nama"}</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Batal</button>
                    </form>
                  )}
                </td>
                <td>
                  {self ? (
                    <span className="hint">Ubah nama, PIN, atau hapus akun Anda lewat formulir di samping.</span>
                  ) : (
                    <div className="actions">
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => setEditing({ id: u.id, mode: "name", value: u.name })}>Ubah nama</button>
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => setEditing({ id: u.id, mode: "pin", value: "" })}>Reset PIN</button>
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => patch(u, { role: u.role === "admin" ? "staff" : "admin" }, u.role === "admin" ? `${u.name} sekarang staf.` : `${u.name} sekarang admin.`)}>
                        {u.role === "admin" ? "Jadikan staf" : "Jadikan admin"}
                      </button>
                      <button type="button" className={`btn btn-sm btn-ghost ${u.active ? "btn-danger" : ""}`} disabled={busy}
                        onClick={() => patch(u, { active: !u.active }, u.active ? `${u.name} dinonaktifkan dan dikeluarkan dari semua perangkat.` : `${u.name} diaktifkan lagi.`)}>
                        {u.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <DeleteButton onConfirm={() => run(u, () => deleteUser(u.id), `Akun ${u.name} dihapus.`)} />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Unduh objek sebagai file .json. */
function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/**
 * Reset semua data kecuali akun. Pengaman berlapis: jumlah data ditampilkan, kalimat konfirmasi
 * diketik persis, PIN admin dicek server, dan backup JSON diunduh dulu (gagal unduh = batal).
 */
function ResetData() {
  const toast = useToast();
  const { changed, responseCache } = useAppData();
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setOpen(true); setPhrase(""); setPin(""); setSummary(null); setError(null);
    fetchDataSummary().then(setSummary).catch((e: Error) => setError(e.message));
  }
  const close = () => { setOpen(false); setPhrase(""); setPin(""); };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!summary || phrase !== summary.phrase || !PIN_RE.test(pin)) return;
    setBusy(true);
    try {
      let backup: unknown;
      try {
        backup = await fetchBackup();
        downloadJson(backup, `yantos-backup-${stamp()}.json`);
      } catch (e) {
        throw new Error(`Backup gagal diunduh, reset dibatalkan. ${(e as Error).message}`);
      }
      await resetAllData(pin, phrase);
      toast("Semua data sudah dihapus. File backup tersimpan di folder unduhan.");
      responseCache.clear();
      changed();
      close();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="grid gap-2">
        <p className="hint">
          Menghapus <b>semua</b> transaksi, data master, pengaturan, dan riwayat aktivitas. Hanya akun yang tetap ada.
          Backup otomatis diunduh lebih dulu.
        </p>
        <button type="button" className="btn btn-ghost btn-danger" onClick={start}>Reset semua data…</button>
      </div>
    );
  }

  const ready = !!summary && phrase === summary.phrase && PIN_RE.test(pin);
  return (
    <form className="form" onSubmit={submit}>
      {!summary ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="notice">
            <b>Data berikut akan dihapus permanen:</b>
            <ul className="mt-1 list-disc pl-5">
              <li>{nf(summary.ledger, 0)} transaksi (stok, penjualan, kas)</li>
              <li>{nf(summary.greens, 0)} green bean, {nf(summary.blends, 0)} blend, {nf(summary.packs, 0)} kemasan, {nf(summary.products, 0)} produk</li>
              <li>Pengaturan usaha (kembali ke bawaan)</li>
              <li>{nf(summary.activity, 0)} catatan riwayat aktivitas</li>
            </ul>
          </div>
          <Field label={`Ketik "${summary.phrase}" untuk melanjutkan`}>
            <input className="input" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} placeholder={summary.phrase} />
          </Field>
          <Field label="PIN Anda"><PinInput value={pin} onChange={setPin} /></Field>
          <div className="actions">
            <button type="submit" className="btn btn-confirm" disabled={!ready || busy}>{busy ? "Memproses…" : "Unduh backup & hapus semua data"}</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>Batal</button>
          </div>
        </>
      )}
    </form>
  );
}
