import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { Direction, Rack } from '../../api';
import { plural } from '../../autofill';
import { BlockGrid } from '../../components/BlockGrid';
import { useWms } from '../../wms';
import { BlockPicker, NeedBlocks } from './shared';

export function RacksStep({ blockCode, setBlockCode, rackCode, setRackCode }: {
  blockCode: string; setBlockCode: (b: string) => void; rackCode: string | null; setRackCode: (r: string | null) => void;
}) {
  const { structure: s, rackTypes, wh, run } = useWms();
  const [f, setF] = useState({ rackTypeId: '', direction: 'ROW' as Direction, startRow: 1, startCol: 1, lengthCells: 1, bays: 1 });
  const [hint, setHint] = useState<{ text: string; err?: boolean }>({ text: '' });
  const b = s?.blocks.find((x) => x.code === blockCode) ?? s?.blocks[0];

  // Auto-fill from the server: length from the rack type, first free spot, one bay per cell.
  const suggest = useCallback(async (rackTypeId: string, direction: Direction) => {
    if (!b || !rackTypeId) return;
    try {
      const sg = await api.suggestRack(wh, b.code, rackTypeId, direction);
      setF((x) => ({ ...x, rackTypeId, direction, lengthCells: sg.lengthCells, bays: sg.bays, startRow: sg.startRow ?? x.startRow, startCol: sg.startCol ?? x.startCol }));
      setHint(sg.startRow
        ? { text: `Auto: ${sg.rackLengthCm} cm ÷ ${Math.round(sg.cellSideCm)} cm per cell ≈ ${plural(sg.lengthCells, 'cell')}; first free spot R${sg.startRow}C${sg.startCol}; bays = one per cell. All editable.` }
        : { text: `No free run of ${plural(sg.lengthCells, 'Storage cell')} ${direction === 'ROW' ? 'along a row' : 'down a column'} in this block.`, err: true });
    } catch (e) { setHint({ text: String(e instanceof Error ? e.message : e), err: true }); }
  }, [b, wh]);

  // Re-suggest when the block changes or racks are added/removed (not on every form edit).
  useEffect(() => { if (rackTypes[0]) void suggest(f.rackTypeId || rackTypes[0].id, f.direction); }, [b?.code, rackTypes.length, s?.racks.length]);

  if (!s) return null;
  if (!b) return <NeedBlocks />;
  const racks = s.racks.filter((r) => r.blockCode === b.code);
  const selected = racks.find((r) => r.code === rackCode) ?? null;

  const create = async () => {
    const r = await run(() => api.createRack(wh, { blockCode: b.code, ...f }), (x) => `Rack ${x.code} placed.`);
    if (r) setRackCode(r.code);
  };

  return (
    <div className="stack">
      <div className="card pad">
        <div className="row" style={{ marginBottom: 12 }}><BlockPicker value={b.code} onChange={(v) => { setBlockCode(v); setRackCode(null); }} /></div>
        <BlockGrid block={b} racks={s.racks} plates={s.plates} floorCells={s.floorCells} mode="view" selectedRack={rackCode} onRack={setRackCode} />
      </div>
      <div className="two-col">
        <div className="card pad">
          <div className="section-title">Racks in {b.name}</div>
          {racks.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Rack</th><th>Type</th><th>Placed</th><th className="num">Bays</th><th className="num">Plates</th></tr></thead>
              <tbody>{racks.map((r) => (
                <tr key={r.code} className={`click${r.code === rackCode ? ' sel' : ''}`} onClick={() => setRackCode(r.code)}>
                  <td><b>{r.name}</b></td><td>{r.rackType.name}</td><td className="mono">R{r.startRow}C{r.startCol} {r.direction === 'ROW' ? '→' : '↓'} {r.lengthCells}</td><td className="num">{r.bays}</td><td className="num">{r.plates}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="empty">No racks in this block yet.</div>}

          <div className="section-title" style={{ marginTop: 18 }}>Create &amp; place a rack</div>
          <div className="form-grid" style={{ ['--cols' as string]: 3 }}>
            <label className="field">Rack type
              <select value={f.rackTypeId} onChange={(e) => void suggest(e.target.value, f.direction)}>
                {rackTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.lengthCm} cm, {t.shelfCount} shelves)</option>)}
              </select>
            </label>
            <label className="field">Direction
              <select value={f.direction} onChange={(e) => void suggest(f.rackTypeId, e.target.value as Direction)}>
                <option value="ROW">Along the row →</option><option value="COLUMN">Down the column ↓</option>
              </select>
            </label>
            <label className="field">Length (cells) <input type="number" min={1} value={f.lengthCells} onChange={(e) => setF({ ...f, lengthCells: Number(e.target.value) })} /></label>
            <label className="field">Start row <input type="number" min={1} max={b.rows} value={f.startRow} onChange={(e) => setF({ ...f, startRow: Number(e.target.value) })} /></label>
            <label className="field">Start column <input type="number" min={1} max={b.cols} value={f.startCol} onChange={(e) => setF({ ...f, startCol: Number(e.target.value) })} /></label>
            <label className="field">Bays <span className="hint">0 = shelf only</span><input type="number" min={0} max={20} value={f.bays} onChange={(e) => setF({ ...f, bays: Number(e.target.value) })} /></label>
          </div>
          {hint.text && <p className={`note${hint.err ? ' err' : ''}`} style={{ marginTop: 10 }}>{hint.text}</p>}
          <div className="form-actions"><button className="btn btn-primary" disabled={!f.rackTypeId} onClick={create}>Create rack</button><span className="note">Cells must be Storage and free.</span></div>
        </div>
        <div className="card pad">{selected ? <RackConfig rack={selected} onDeleted={() => setRackCode(null)} /> : <div className="empty">Select a rack to set its bays, merge shelves and add plates.</div>}</div>
      </div>
    </div>
  );
}

function RackConfig({ rack, onDeleted }: { rack: Rack; onDeleted: () => void }) {
  const { structure: s, plateTypes, wh, run } = useWms();
  const fitting = plateTypes.filter((p) => p.widthCm <= rack.rackType.depthCm);
  const [ptId, setPtId] = useState('');
  const pt = fitting.find((p) => p.id === ptId) ?? fitting[0];
  const t = rack.rackType;
  const posLen = rack.bays ? t.lengthCm / rack.bays : t.lengthCm;
  const positions = rack.bays ? Array.from({ length: rack.bays }, (_, i) => i + 1) : [0];
  const platesAt = (level: number, bay: number) =>
    (s?.plates ?? []).filter((p) => p.parent.kind === 'POSITION' && p.parent.rackCode === rack.code && p.parent.shelfLevel === level && p.parent.bay === bay);

  const setMerges = (merged: number[], msg: string) => run(() => api.updateRack(wh, rack.code, { mergedShelves: merged }), msg);

  return (
    <>
      <div className="section-title">Configure {rack.name} · {t.name}</div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>Bays
          <select value={rack.bays} onChange={(e) => run(() => api.updateRack(wh, rack.code, { bays: Number(e.target.value) }), `${rack.name} bays updated.`)}>
            {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n === 0 ? '0 (shelf only)' : n}</option>)}
          </select>
        </label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>Plate type
          <select value={pt?.id ?? ''} onChange={(e) => setPtId(e.target.value)}>
            {fitting.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.lengthCm}×{p.widthCm})</option>)}
          </select>
        </label>
        <span className="note">{pt ? `auto: ${Math.floor(posLen / pt.lengthCm + 1e-9)} × ${pt.name} fit per ${rack.bays ? `bay (${Math.round(posLen)} cm)` : `shelf (${t.lengthCm} cm)`}` : 'No plate type is shallow enough for this rack.'}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost btn-danger" onClick={async () => { if (await run(() => api.deleteRack(wh, rack.code), `${rack.name} deleted.`)) onDeleted(); }}>Delete rack</button>
      </div>
      <div className="section-title">Shelves (top first) · merge for tall items · plates per position</div>
      {[...rack.shelves].reverse().map((sh) => {
        const canMerge = sh.span === 1 && sh.level < t.shelfCount && rack.shelves.some((x) => x.level === sh.level + 1 && x.span === 1);
        return (
          <div key={sh.level} className="shelf-block">
            <div className="shelf-top">
              <span className="sn">S{sh.level}{sh.span > 1 ? ` + S${sh.level + 1}` : ''} · fits up to {sh.heightCm} cm · {sh.capKg} kg</span>
              {sh.span > 1
                ? <button className="btn btn-xs" onClick={() => setMerges(rack.mergedShelves.filter((m) => m !== sh.level), `${rack.name}: shelf S${sh.level} split back.`)}>Split</button>
                : canMerge && <button className="btn btn-xs" onClick={() => setMerges([...rack.mergedShelves, sh.level], `${rack.name}: S${sh.level} and S${sh.level + 1} merged.`)}>Merge with S{sh.level + 1}</button>}
            </div>
            <div className="pos-row" style={{ gridTemplateColumns: `repeat(${Math.min(positions.length, 5)}, minmax(0, 1fr))` }}>
              {positions.map((bay) => {
                const ps = platesAt(sh.level, bay);
                return (
                  <div key={bay} className="pos-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="pl">{bay ? `B${bay}` : 'Shelf'}</span>
                    <span className="cnt-ctl">
                      <button aria-label="Remove plate" disabled={!ps.length} onClick={() => run(() => api.deletePlate(wh, ps[ps.length - 1].label), `Plate ${ps[ps.length - 1].label} removed.`)}>−</button>
                      <b>{ps.length}</b>
                      <button aria-label="Add plate" disabled={!pt} onClick={() => pt && run(() => api.createPlates(wh, { plateTypeId: pt.id, count: 1, rackCode: rack.code, shelfLevel: sh.level, bay }), 'Plate added.')}>+</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="note">Changes are refused while stock or plates are in the way — the message says what to move first.</p>
    </>
  );
}
