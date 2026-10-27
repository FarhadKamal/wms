import { CELL_USE_LABEL } from '../api';
import type { CellUse } from '../api';
import { pct, sqft } from '../autofill';
import { useWms } from '../wms';

export function OverviewPage({ go }: { go: (page: 'layout' | 'setup') => void }) {
  const { structure: s } = useWms();
  if (!s) return <div className="card pad"><div className="empty">Loading…</div></div>;
  const w = s.warehouse, sm = s.summary;
  const full = sm.shelvesAtWeightLimit;

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
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => go('layout')}><div className="k">Racks</div><div className="v">{sm.racks}</div><div className="s">{[...new Set(s.racks.map((r) => r.rackType.name))].join(', ') || 'none yet'}</div></button>
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => go('layout')}><div className="k">Plates</div><div className="v">{sm.plates}</div><div className="s">{sm.platesInShelves} in shelves · {sm.platesOnFloor} on floor</div></button>
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => go('layout')}><div className="k">Storage locations</div><div className="v">{sm.locations - 1}</div><div className="s">bays, shelves, plates, floor cells</div></button>
        <button className={`card kpi${full.length ? ' alert' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => go('layout')}><div className="k">Shelves at weight limit</div><div className="v">{full.length}</div><div className="s">{full.length ? full.join(', ') : 'all within limit'}</div></button>
      </div>
      <p className="note">Receiving, put-away, dispatch and stock screens come in the next module. This module sets up the warehouse structure they will use.</p>
    </div>
  );
}
