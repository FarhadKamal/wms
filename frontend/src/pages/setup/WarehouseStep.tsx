import { useEffect, useState } from 'react';
import { api } from '../../api';
import { sqft, suggestCode } from '../../autofill';
import { useWms } from '../../wms';

export function WarehouseStep({ onCreated }: { onCreated: () => void }) {
  const { structure: s, warehouses, wh, setWh, run } = useWms();
  const [form, setForm] = useState({ name: '', address: '', landmark: '', areaSqft: 0, status: 'ACTIVE' as 'ACTIVE' | 'PLANNED' });
  const [nw, setNw] = useState({ code: '', name: '', address: '', areaSqft: '' });
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (s) setForm({ name: s.warehouse.name, address: s.warehouse.address, landmark: s.warehouse.landmark, areaSqft: s.warehouse.areaSqft, status: s.warehouse.status });
  }, [s]);
  if (!s) return null;

  const create = async () => {
    const ok = await run(() => api.createWarehouse({ code: nw.code, name: nw.name, address: nw.address, areaSqft: Number(nw.areaSqft) }), `Warehouse ${nw.name} created. Now add its blocks.`);
    if (ok) { setWh(nw.code); setNw({ code: '', name: '', address: '', areaSqft: '' }); setCodeTouched(false); onCreated(); }
  };

  return (
    <div className="two-col">
      <div className="card pad">
        <div className="section-title">Warehouse {wh}</div>
        <div className="form-grid">
          <label className="field full">Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field full">Location / address <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="field full">Landmark <input value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} /></label>
          <label className="field">Total area (sq ft) <input type="number" min={1} value={form.areaSqft} onChange={(e) => setForm({ ...form, areaSqft: Number(e.target.value) })} /></label>
          <label className="field">Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'PLANNED' })}>
              <option value="ACTIVE">Live</option><option value="PLANNED">Planned</option>
            </select>
          </label>
        </div>
        <div className="form-actions"><button className="btn btn-primary" onClick={() => run(() => api.updateWarehouse(wh, form), 'Warehouse saved.')}>Save warehouse</button></div>
        <div className="kpis" style={{ ['--cols' as string]: 3, marginTop: 14 }}>
          <div className="kpi"><div className="k">In blocks</div><div className="v">{Math.round(s.summary.blockAreaSqft).toLocaleString('en-IN')}</div><div className="s">sq ft · {s.summary.blocks} blocks</div></div>
          <div className="kpi"><div className="k">Storage</div><div className="v">{Math.round(s.summary.storageSqft).toLocaleString('en-IN')}</div><div className="s">sq ft usable</div></div>
          <div className="kpi"><div className="k">Outside blocks</div><div className="v">{Math.round(s.summary.outsideBlocksSqft).toLocaleString('en-IN')}</div><div className="s">sq ft</div></div>
        </div>
      </div>

      <div className="stack">
        <div className="card pad">
          <div className="section-title">All warehouses</div>
          {warehouses.map((w) => (
            <div key={w.code} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{w.name} ({w.code})</b> <span className={`pill ${w.status === 'ACTIVE' ? 'good' : 'warning'}`}>{w.status === 'ACTIVE' ? 'Live' : 'Planned'}</span>
                <div className="note">{w.address}</div>
              </div>
              <div className="note" style={{ textAlign: 'right' }}>{sqft(w.areaSqft)}<br />{w._count.blocks} blocks</div>
              {w.code === wh ? <span className="pill info">current</span> : <button className="btn btn-xs" onClick={() => setWh(w.code)}>Open</button>}
            </div>
          ))}
        </div>
        <div className="card pad">
          <div className="section-title">Create a new warehouse</div>
          <div className="form-grid">
            <label className="field">Name <input value={nw.name} placeholder="e.g. Khulna" onChange={(e) => setNw({ ...nw, name: e.target.value, code: codeTouched ? nw.code : suggestCode(e.target.value, warehouses.map((w) => w.code)) })} /></label>
            <label className="field">Code <span className="hint">auto from name · 2–4 letters</span>
              <input value={nw.code} maxLength={4} onChange={(e) => { setCodeTouched(!!e.target.value); setNw({ ...nw, code: e.target.value.toUpperCase() }); }} />
            </label>
            <label className="field full">Location / address <input value={nw.address} onChange={(e) => setNw({ ...nw, address: e.target.value })} /></label>
            <label className="field">Total area (sq ft) <input type="number" min={1} value={nw.areaSqft} onChange={(e) => setNw({ ...nw, areaSqft: e.target.value })} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={!nw.name || !nw.code || !nw.address || !Number(nw.areaSqft)} onClick={create}>Create warehouse</button>
            <span className="note">Next: add its blocks.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
