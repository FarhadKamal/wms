import { useState } from 'react';
import { api, todayLocal } from '../api';
import type { Doc } from '../api';
import { DocModal } from '../components/Docs';
import { useWms } from '../wms';

interface Line { sku: string; qty: number; vins: string }

/** Goods are unloaded into the Receiving Area first; this records them on one challan with a QR label per unit. */
export function ReceivePage({ goPutAway }: { goPutAway: () => void }) {
  const { products, wh, me, run } = useWms();
  const [party, setParty] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [lines, setLines] = useState<Line[]>([{ sku: '', qty: 1, vins: '' }]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const byCat = [...new Set(products.map((p) => p.category.name))];
  const productOf = (sku: string) => products.find((p) => p.sku === sku);
  const setLine = (i: number, l: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...l } : x)));
  const total = lines.reduce((s, l) => s + (l.qty || 0), 0);

  const submit = async () => {
    const r = await run(() => api.receive(wh, {
      party, reference, date,
      lines: lines.map((l) => ({ sku: l.sku, qty: l.qty, ...(productOf(l.sku)?.category.idRule === 'VIN' ? { vins: l.vins.split(/\s+/).filter(Boolean) } : {}) })),
    }), (d) => `${d.units} units received into the Receiving Area on ${d.no}.`);
    if (r) { setDoc(r); setLines([{ sku: '', qty: 1, vins: '' }]); setReference(''); }
  };

  return (
    <>
      <p className="lead">Goods are first <b>unloaded into the Receiving Area</b>. Count them there, then confirm here: the WMS creates <b>one Receiving Challan for the whole delivery</b> and a <b>unique QR label for every unit</b> (cars use their VIN). Shelving happens next, in <b>Put-away</b>.</p>
      <div className="card pad" style={{ maxWidth: 860 }}>
        <div className="section-title">Delivery</div>
        <div className="form-grid">
          <label className="field">Supplier <input value={party} placeholder="e.g. Pedrollo S.p.A." onChange={(e) => setParty(e.target.value)} /></label>
          <label className="field">Supplier's delivery ref. <span className="hint">their invoice / B/L / delivery note</span><input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <label className="field">Received date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Received by <span className="hint">from your login</span><input value={me.fullName} readOnly /></label>
        </div>
        <div className="section-title" style={{ marginTop: 20 }}>Products in this delivery</div>
        {lines.map((l, i) => {
          const p = productOf(l.sku);
          return (
            <div key={i} className="line-row">
              <label className="field">Product
                <select value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value, vins: '' })}>
                  <option value="">Choose a product…</option>
                  {byCat.map((c) => <optgroup key={c} label={c}>{products.filter((x) => x.category.name === c).map((x) => <option key={x.sku} value={x.sku}>{x.name}</option>)}</optgroup>)}
                </select>
              </label>
              <label className="field">Qty <input type="number" min={1} value={l.qty} disabled={p?.category.idRule === 'VIN'} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></label>
              <button className="icon-btn" title="Remove line" aria-label="Remove line" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [{ sku: '', qty: 1, vins: '' }])}>×</button>
              {p?.category.idRule === 'VIN'
                ? <label className="field vin-box">VINs — one per line <span className="hint">the quantity counts the VINs; each car gets a QR sticker carrying its VIN</span>
                    <textarea rows={3} value={l.vins} placeholder="17-character VIN per line"
                      onChange={(e) => { const n = e.target.value.split(/\s+/).filter(Boolean).length; setLine(i, { vins: e.target.value, qty: Math.max(1, n) }); }} />
                  </label>
                : p && <div className="note vin-box">{p.lengthCm}×{p.widthCm}×{p.heightCm} cm · {p.weightKg} kg per unit. Each unit gets its own ID like <span className="mono">{p.sku}-0001</span>, printed as a QR label.</div>}
            </div>
          );
        })}
        <button className="btn btn-sm" onClick={() => setLines([...lines, { sku: '', qty: 1, vins: '' }])}>+ Add product</button>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!party.trim() || lines.some((l) => !l.sku || !(l.qty > 0))} onClick={submit}>Confirm receipt &amp; generate challan</button>
          <span className="note">{lines.length} product line{lines.length === 1 ? '' : 's'} · {total} units → 1 challan, {total} QR labels</span>
        </div>
      </div>
      {doc && <DocModal doc={doc} onClose={() => setDoc(null)} extra={<button className="btn" onClick={() => { setDoc(null); goPutAway(); }}>Go to Put-away →</button>} />}
    </>
  );
}
