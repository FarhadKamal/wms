import { useEffect, useState } from 'react';
import { api, CELL_USE_LABEL } from '../api';
import type { CellUse, Dashboard } from '../api';
import { pct, sqft } from '../autofill';
import { useWms } from '../wms';
import { DocRows, useDocViewer } from './RecordsPages';

export type Go = (page: 'layout' | 'setup' | 'receive' | 'putaway' | 'dispatch' | 'boards' | 'stock' | 'challans') => void;

export function OverviewPage({ go }: { go: Go }) {
  const { structure: s, wh, version } = useWms();
  const [d, setD] = useState<Dashboard | null>(null);
  const viewer = useDocViewer();
  useEffect(() => { api.dashboard(wh).then(setD).catch(() => setD(null)); }, [wh, version]);
  if (!s) return <div className="card pad"><div className="empty">Loading…</div></div>;
  const w = s.warehouse, sm = s.summary, full = sm.shelvesAtWeightLimit;
  const tile = (label: string, value: number | string, sub: string, to: Parameters<Go>[0], cls = '') => (
    <button className={`card kpi ${cls}`} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => go(to)}>
      <div className="k">{label}</div><div className="v">{value}</div><div className="s">{sub}</div>
    </button>
  );

  return (
    <div className="stack">
      {w.status === 'PLANNED' && <div className="banner">⚠ <span><b>{w.name} is planned, not live yet.</b> Set up its layout in Warehouse Setup.</span></div>}
      <div className="card pad two-col">
        <div>
          <div className="crumb">Warehouse {w.code}</div>
          <h2 style={{ fontSize: 18 }}>{w.name} <span className={`pill ${w.status === 'ACTIVE' ? 'good' : 'warning'}`}>{w.status === 'ACTIVE' ? 'Live' : 'Planned'}</span></h2>
          <p className="note" style={{ marginTop: 4 }}>{w.address}{w.landmark && <><br />{w.landmark}</>}</p>
          <div className="kpis" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="k">Total area</div><div className="v">{Math.round(w.areaSqft).toLocaleString('en-IN')}</div><div className="s">sq ft</div></div>
            <div className="kpi"><div className="k">Blocks</div><div className="v">{sm.blocks}</div><div className="s">{sqft(sm.blockAreaSqft)}</div></div>
            <div className="kpi"><div className="k">Storage area</div><div className="v">{Math.round(sm.storageSqft).toLocaleString('en-IN')}</div><div className="s">sq ft usable</div></div>
            <div className="kpi"><div className="k">Outside blocks</div><div className="v">{Math.round(sm.outsideBlocksSqft).toLocaleString('en-IN')}</div><div className="s">sq ft</div></div>
          </div>
        </div>
        <div>
          <div className="section-title">Block area by use</div>
          {(Object.keys(sm.areaByUse) as CellUse[]).map((u) => (
            <div key={u} className="meter-row">
              <b>{CELL_USE_LABEL[u]}</b>
              <div className="meter"><div className="meter-fill" style={{ width: `${pct(sm.areaByUse[u]!, sm.blockAreaSqft)}%`, ...(u === 'STORAGE' ? {} : { background: 'var(--ink-muted)', opacity: 0.55 }) }} /></div>
              <span className="val">{sqft(sm.areaByUse[u]!)} · {pct(sm.areaByUse[u]!, sm.blockAreaSqft)}%</span>
            </div>
          ))}
          {!Object.keys(sm.areaByUse).length && <div className="empty">No blocks yet.</div>}
        </div>
      </div>

      <div className="kpis" style={{ ['--cols' as string]: 4 }}>
        {tile('Units on shelf', d?.inStock ?? '–', `in ${w.code}`, 'stock')}
        {tile('Waiting for put-away', d?.staging ?? '–', 'in Receiving Area', 'putaway', d?.staging ? 'warn' : '')}
        {tile('Received today', d?.receivedToday ?? '–', 'units', 'challans')}
        {tile('Dispatched today', d?.dispatchedToday ?? '–', 'units', 'challans')}
        {tile('Racks', sm.racks, [...new Set(s.racks.map((r) => r.rackType.name))].join(', ') || 'none yet', 'layout')}
        {tile('Plates', sm.plates, `${sm.platesInShelves} in shelves · ${sm.platesOnFloor} on floor`, 'layout')}
        {tile('Shelves at weight limit', full.length, full.length ? full.join(', ') : 'all within limit', 'layout', full.length ? 'alert' : '')}
        {tile('Bay boards to update', d?.boardsToUpdate ?? '–', 'stock changed', 'boards', d?.boardsToUpdate ? 'warn' : '')}
      </div>

      <div className="flow">
        <button className="flow-step" onClick={() => go('receive')}><div className="n">01</div><div className="t">Unload</div><div className="d">Goods land in the Receiving Area</div></button>
        <button className="flow-step" onClick={() => go('receive')}><div className="n">02</div><div className="t">Receive</div><div className="d">Challan + one QR label per unit</div></button>
        <button className="flow-step" onClick={() => go('putaway')}><div className="n">03</div><div className="t">Put-away</div><div className="d">Scan unit → scan shelf / bay / plate</div></button>
        <button className="flow-step" onClick={() => go('dispatch')}><div className="n">04</div><div className="t">Dispatch</div><div className="d">Receiver → scan units → challan</div></button>
      </div>

      <div className="two-col">
        <div className="card pad"><div className="section-title">Latest documents</div><DocRows docs={d?.latestDocs ?? []} onOpen={viewer.open} /></div>
        <div className="card pad">
          <div className="section-title">Below reorder level</div>
          {d?.lowStock.length ? d.lowStock.map((x) => (
            <div key={x.sku} className="list-row"><div className="row-main"><div className="t1">{x.name}</div><div className="t2">{x.sku}</div></div><span className={`pill ${x.total <= x.reorderPoint / 2 ? 'critical' : 'warning'}`}>{x.total} / {x.reorderPoint}</span></div>
          )) : <div className="empty">Everything is above its reorder level{d && !d.latestDocs.length ? ' (no stock received yet)' : ''}.</div>}
        </div>
      </div>
      {viewer.modal}
    </div>
  );
}
