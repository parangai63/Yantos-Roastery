import { ledgerApi, reportApi } from "../api";
import CashChart from "../components/CashChart";
import EntryFeed from "../components/EntryFeed";
import { Kpi, Loading, Panel, Pill } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import { mLabel, nf, rp, rps, short } from "../utils/format";
import { T_LABEL, T_UNIT } from "../utils/ledger";

export default function Ringkasan() {
  const { month } = useAppData();
  const { data: s, error } = useLoad(() => reportApi.summary(month), [month]);
  const { data: recent } = useLoad(() => ledgerApi.list({ limit: 10, order: "recent" }), []);

  if (!s) return <Loading error={error} />;
  const k = s.kpi;

  return (
    <div className="grid gap-4">
      <section className="kpis">
        <Kpi label="Pemasukan" value={rp(k.cin)} sub={mLabel(month)} />
        <Kpi label="Pengeluaran" value={rp(k.cout)} sub={mLabel(month)} />
        <Kpi label="Laba" value={rps(k.laba)} sub={k.basis === "op" ? "Tanpa modal & dividen" : "Pemasukan − pengeluaran"} cls={k.laba > 0 ? "pos" : k.laba < 0 ? "neg" : ""} />
        <Kpi label="Saldo kas" value={rps(k.bal)} sub="Per hari ini" cls={k.bal < 0 ? "neg" : ""} />
        <Kpi label="Piutang" value={rp(k.recvTotal)} sub={`${k.recvCount} order belum dibayar`} />
        <Kpi label="Nilai stok" value={rp(k.invT)} sub={`Green ${short(k.inv.green)} · roasted ${short(k.inv.roasted)} · blend ${short(k.inv.blend)}`} />
      </section>

      <div className="grid2">
        <Panel title="Pemasukan vs pengeluaran kas" hint="6 bulan sampai periode terpilih">
          <CashChart data={s.chart} current={month} />
        </Panel>
        <Panel title="Perlu restock" hint={s.alerts.length ? `${s.alerts.length} item` : ""}>
          {s.overdue.count > 0 && (
            <div className="alert">
              <div><b>{s.overdue.count} piutang lewat jatuh tempo</b><div className="hint">Total {rp(s.overdue.total)} · cek di Laporan → Piutang &amp; hutang</div></div>
              <Pill tone="bad">Tagih</Pill>
            </div>
          )}
          {s.alerts.slice(0, 8).map((a) => (
            <div key={a.t + a.id} className="alert">
              <div><b>{a.name}</b><div className="hint">{T_LABEL[a.t]} · sisa {nf(a.q, a.t === "pack" ? 0 : 2)} {T_UNIT[a.t]} · reorder {nf(a.min, 2)}</div></div>
              {a.bad ? <Pill tone="bad">Habis</Pill> : <Pill tone="warn">Menipis</Pill>}
            </div>
          ))}
          {s.alerts.length > 8 && <p className="hint">+{s.alerts.length - 8} item lain. Lihat menu Stok → filter "Perlu restock".</p>}
          {!s.alerts.length && !s.overdue.count && <p className="empty">Stok aman dan tidak ada tagihan lewat tempo.</p>}
        </Panel>
      </div>

      <Panel title="Aktivitas terbaru" hint="Semua orang di tim">
        {recent ? <EntryFeed entries={recent} empty="Belum ada transaksi." /> : <Loading />}
      </Panel>
    </div>
  );
}
