import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { BlockGrid } from '../../components/BlockGrid';
import { useWms } from '../../wms';
import { BlockPicker, NeedBlocks } from './shared';

export function PlatesStep({ blockCode, setBlockCode }: { blockCode: string; setBlockCode: (b: string) => void }) {
  const { structure: s, plateTypes, wh, run } = useWms();
  const floorTypes = plateTypes.filter((t) => t.floorStackHeightCm > 0);
  const [f, setF] = useState({ plateTypeId: '', row: 1, col: 1, count: 1 });
  const [hint, setHint] = useState<{ text: string; err?: boolean }>({ text: '' });
  const b = s?.blocks.find((x) => x.code === blockCode) ?? s?.blocks[0];

  // Auto-fill: first storage cell with room, and how many plates fit there.
  const suggest = useCallback(async (plateTypeId: string) => {
    if (!b || !plateTypeId) return;
    const sg = await api.suggestFloorPlate(wh, b.code, plateTypeId);
    const pt = plateTypes.find((p) => p.id === plateTypeId);
    if (sg.row && sg.col) {
      setF({ plateTypeId, row: sg.row, col: sg.col, count: sg.room });
      setHint({ text: `Auto: R${sg.row}C${sg.col} (${Math.round(sg.cellAreaSqft ?? 0)} sq ft) has room for ${sg.room} × ${pt?.name} (${pt?.lengthCm}×${pt?.widthCm} cm).` });
    } else {
      setF((x) => ({ ...x, plateTypeId, count: 1 }));
      setHint({ text: `${sg.reason}. Mark more cells as Storage (step 3) or pick another block.`, err: true });
    }
  }, [b, wh, plateTypes]);

  // Re-suggest when the block changes or plates are added/removed (not on every form edit).
  useEffect(() => { if (floorTypes[0]) void suggest(f.plateTypeId || floorTypes[0].id); }, [b?.code, floorTypes.length, s?.plates.length]);

  if (!s) return null;
  if (!b) return <NeedBlocks />;

  return (
    <div className="stack">
      <div className="card pad">
        <div className="section-title">Place plates on the floor</div>
        <p className="note" style={{ marginBottom: 12 }}>Plates beside a rack or in floor rows. Plates inside shelves and bays are added in step 5.</p>
        <div className="form-grid" style={{ ['--cols' as string]: 5 }}>
          <BlockPicker value={b.code} onChange={setBlockCode} />
          <label className="field">Plate type
            <select value={f.plateTypeId} onChange={(e) => void suggest(e.target.value)}>
              {floorTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field">Row <input type="number" min={1} max={b.rows} value={f.row} onChange={(e) => setF({ ...f, row: Number(e.target.value) })} /></label>
          <label className="field">Column <input type="number" min={1} max={b.cols} value={f.col} onChange={(e) => setF({ ...f, col: Number(e.target.value) })} /></label>
          <label className="field">How many <span className="hint">auto: as many as fit</span><input type="number" min={1} value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })} /></label>
        </div>
        {hint.text && <p className={`note${hint.err ? ' err' : ''}`} style={{ marginTop: 10 }}>{hint.text}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!f.plateTypeId}
            onClick={() => run(() => api.createPlates(wh, { plateTypeId: f.plateTypeId, count: f.count, blockCode: b.code, row: f.row, col: f.col }), `${f.count} plate${f.count === 1 ? '' : 's'} placed at R${f.row}C${f.col}.`)}>
            Create plate(s)
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <BlockGrid block={b} racks={s.racks} plates={s.plates} floorCells={s.floorCells} mode="view" onCell={(row, col) => setF({ ...f, row, col })} />
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Plate label</th><th>Type</th><th>Address</th><th>Where</th><th className="num">Units</th><th className="num">Weight</th><th /></tr></thead>
          <tbody>
            {s.plates.map((p) => (
              <tr key={p.label}>
                <td><span className="code plate">{p.label}</span></td><td>{p.plateType.name}</td><td className="mono">{p.address ?? '—'}</td>
                <td>{p.parent.kind === 'POSITION' ? 'In rack shelf' : 'On floor'}</td><td className="num">{p.units}</td><td className="num">{Math.round(p.usedKg)} / {p.capKg} kg</td>
                <td><button className="btn btn-xs btn-ghost btn-danger" disabled={p.units > 0} title={p.units ? 'Move its stock first' : ''} onClick={() => run(() => api.deletePlate(wh, p.label), `Plate ${p.label} removed.`)}>Remove</button></td>
              </tr>
            ))}
            {!s.plates.length && <tr><td colSpan={7} className="empty">No plates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
