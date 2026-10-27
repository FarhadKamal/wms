import type { Plate, Rack } from '../api';
import { pct } from '../autofill';

/** Rack detail: every shelf (top first) with weight and space bars, its bays and plates. */
export function RackDrawer({ rack, plates, onClose, onConfigure }: { rack: Rack; plates: Plate[]; onClose: () => void; onConfigure?: () => void }) {
  const t = rack.rackType;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" aria-label={rack.name}>
        <div className="drawer-head">
          <div><div className="crumb">Block {rack.blockCode} · {t.name}</div><h2>{rack.name}</h2></div>
          <button className="x-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="drawer-body">
          <div className="kpis">
            <div className="kpi"><div className="k">Type</div><div className="v">{t.name}</div><div className="s">{t.lengthCm}×{t.depthCm} cm</div></div>
            <div className="kpi"><div className="k">Bays</div><div className="v">{rack.bays}</div><div className="s">{rack.bays ? 'per shelf' : 'shelf only'}</div></div>
            <div className="kpi"><div className="k">Shelves</div><div className="v">{rack.shelves.length}</div><div className="s">{t.shelfHeightCm} cm each</div></div>
            <div className="kpi"><div className="k">Shelf limit</div><div className="v">{t.shelfCapKg}</div><div className="s">kg per shelf</div></div>
          </div>
          <p className="note">Placed at R{rack.startRow}C{rack.startCol} {rack.direction === 'ROW' ? 'along the row' : 'down the column'}, {rack.lengthCells} cells. Top shelf first.</p>
          {[...rack.shelves].reverse().map((s) => {
            const full = s.band === 'full';
            const positions = rack.bays ? Array.from({ length: rack.bays }, (_, i) => i + 1) : [0];
            return (
              <div key={s.level} className={`shelf-block${full ? ' full' : ''}`}>
                <div className="shelf-top">
                  <span className="sn">Shelf {s.level}{s.span > 1 ? `+${s.level + 1} (merged)` : ''} · fits items up to {s.heightCm} cm</span>
                  {full && <span className="wfull">⚠ WEIGHT FULL — space still free</span>}
                </div>
                <div className="dual">
                  <span>Weight</span><div className="meter"><div className={`meter-fill ${s.band === 'empty' ? 'ok' : s.band}`} style={{ width: `${Math.min(100, pct(s.usedKg, s.capKg))}%` }} /></div><span className="v">{Math.round(s.usedKg)} / {s.capKg} kg</span>
                  <span>Space</span><div className="meter"><div className="meter-fill" style={{ width: `${Math.min(100, pct(s.usedCm3, s.volumeCm3))}%` }} /></div><span className="v">{pct(s.usedCm3, s.volumeCm3)}% used</span>
                </div>
                <div className="pos-row" style={{ gridTemplateColumns: `repeat(${positions.length}, minmax(0, 1fr))` }}>
                  {positions.map((bay) => {
                    const ps = plates.filter((p) => p.parent.kind === 'POSITION' && p.parent.rackCode === rack.code && p.parent.shelfLevel === s.level && p.parent.bay === bay);
                    return (
                      <div key={bay} className="pos-box">
                        <div className="pl">{bay ? `B${bay}` : 'Whole shelf'}</div>
                        {ps.map((p) => <span key={p.label} className="plate-chip" title={p.address ?? ''}>{p.label.split('-').pop()}{p.units ? ` · ${p.units}` : ''}</span>)}
                        {!ps.length && <div className="note">no plates</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {onConfigure && <div><button className="btn btn-sm" onClick={onConfigure}>Configure in Setup</button></div>}
        </div>
      </aside>
    </>
  );
}
