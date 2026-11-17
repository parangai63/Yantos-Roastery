// Akun & PIN. Semua pengguna bisa mengganti PIN sendiri; admin juga bisa menambah akun,
// mengubah peran, menonaktifkan, dan mereset PIN akun lain (server tetap memeriksa hak admin).
// PIN wajib unik antar akun karena login hanya dengan PIN (tanpa memilih nama).

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { changePin } from "../api/auth";
import { createUser, fetchUsers, updateUser } from "../api/users";
import { useToast } from "../components/Toast";
import { Loading, Panel, Pill } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { User, UserRole } from "../types/auth";

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
        <Panel title="Ganti PIN saya" hint={user ? `Masuk sebagai ${user.name}` : undefined}>
          <ChangeOwnPin />
        </Panel>
        {isAdmin && (
          <Panel title="Tambah akun">
            <CreateUserForm onDone={reload} />
          </Panel>
        )}
      </div>
      {isAdmin ? (
        <Panel title={`Daftar akun${users ? " · " + users.length : ""}`}>
          {users ? <UserList users={users} selfId={user!.id} onChanged={reload} /> : <Loading error={error} />}
        </Panel>
      ) : (
        <Panel title="Daftar akun">
          <p className="empty">Hanya admin yang bisa menambah atau mengelola akun.</p>
        </Panel>
      )}
    </div>
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
      <Field label="Nama"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama staf" required /></Field>
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

function UserList({ users, selfId, onChanged }: { users: User[]; selfId: string; onChanged: () => void }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState("");

  const sorted = users.slice().sort((a, b) => Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name, "id"));

  async function patch(u: User, body: { active?: boolean; role?: UserRole; pin?: string }, msg: string) {
    setBusyId(u.id);
    try {
      await updateUser(u.id, body);
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

  async function submitReset(ev: FormEvent, u: User) {
    ev.preventDefault();
    if (!PIN_RE.test(resetPin)) return toast("PIN harus 4 angka.", true);
    if (await patch(u, { pin: resetPin }, `PIN ${u.name} direset. Sesinya di semua perangkat dikeluarkan.`)) {
      setResetId(null); setResetPin("");
    }
  }

  return (
    <div className="tw">
      <table className="tbl">
        <tbody>
          {sorted.map((u) => {
            const self = u.id === selfId;
            const busy = busyId === u.id;
            return (
              <tr key={u.id} className={u.active ? "" : "muted"}>
                <td>
                  <b>{u.name}</b>{" "}
                  <Pill tone={u.role === "admin" ? "roast" : undefined}>{u.role === "admin" ? "Admin" : "Staf"}</Pill>
                  {!u.active && <> <Pill tone="bad">Nonaktif</Pill></>}
                  {self && <> <Pill tone="ok">Anda</Pill></>}
                  <span className="sub">Dibuat {new Date(u.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {resetId === u.id && (
                    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(ev) => submitReset(ev, u)}>
                      <div className="w-[120px]"><PinInput value={resetPin} onChange={setResetPin} label={`PIN baru untuk ${u.name}`} autoFocus /></div>
                      <button type="submit" className="btn btn-sm" disabled={busy}>Simpan PIN</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setResetId(null); setResetPin(""); }}>Batal</button>
                    </form>
                  )}
                </td>
                <td>
                  {self ? (
                    <span className="hint">Ganti PIN Anda lewat formulir di samping.</span>
                  ) : (
                    <div className="actions">
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => { setResetId(u.id); setResetPin(""); }}>Reset PIN</button>
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => patch(u, { role: u.role === "admin" ? "staff" : "admin" }, u.role === "admin" ? `${u.name} sekarang staf.` : `${u.name} sekarang admin.`)}>
                        {u.role === "admin" ? "Jadikan staf" : "Jadikan admin"}
                      </button>
                      <button type="button" className={`btn btn-sm btn-ghost ${u.active ? "btn-danger" : ""}`} disabled={busy}
                        onClick={() => patch(u, { active: !u.active }, u.active ? `${u.name} dinonaktifkan dan dikeluarkan dari semua perangkat.` : `${u.name} diaktifkan lagi.`)}>
                        {u.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
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
