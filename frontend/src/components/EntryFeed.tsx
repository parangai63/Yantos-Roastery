// Daftar entri ledger dengan aksi "Tandai lunas" dan "Hapus" (port feed() lama).

import { ledgerApi } from "../api";
import { useAppData } from "../context/AppData";
import type { LedgerEntry } from "../types";
import { dLabel, rp } from "../utils/format";
import { describe, payStatus, TYPE_LABEL, TYPE_TONE } from "../utils/ledger";
import { useToast } from "./Toast";
import { DeleteButton, Pill } from "./ui";

export default function EntryFeed({ entries, empty, limit }: { entries: LedgerEntry[]; empty: string; limit?: number }) {
  const { master, changed } = useAppData();
  const toast = useToast();
  if (!master) return null;
  if (!entries.length) return <p className="empty">{empty}</p>;
  const shown = limit ? entries.slice(0, limit) : entries;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); changed(); } catch (e) { toast((e as Error).message, true); }
  };

  return (
    <div className="feed">
      {shown.map((e) => {
        const d = describe(e, master);
        const st = payStatus(e);
        const canPay = st && st.tone !== "ok";
        return (
          <div key={e.id} className="it">
            <Pill tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Pill>
            <div className="txt">
              {d.text}
              <div className="meta flex flex-wrap items-center gap-1.5">
                {dLabel(e.date)}
                {e.by && <span>· {e.by}</span>}
                {st && <Pill tone={st.tone}>{st.label}</Pill>}
              </div>
            </div>
            <div className="grid justify-items-end gap-1">
              {d.amt != null && <span className={`amt ${d.amt > 0 ? "in" : ""}`}>{d.amt > 0 ? "+" : "−"}{rp(Math.abs(d.amt))}</span>}
              <div className="actions">
                {canPay && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => act(() => ledgerApi.markPaid(e.id), "Ditandai lunas hari ini dan masuk buku kas.")}>Tandai lunas</button>
                )}
                <DeleteButton onConfirm={() => act(() => ledgerApi.remove(e.id), "Transaksi dihapus.")} />
              </div>
            </div>
          </div>
        );
      })}
      {limit && entries.length > limit && <p className="hint pt-2">+{entries.length - limit} catatan lain</p>}
    </div>
  );
}
