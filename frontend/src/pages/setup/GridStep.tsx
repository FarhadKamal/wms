import { useState } from 'react';
import { api, CELL_USE_LABEL } from '../../api';
import type { CellUse } from '../../api';
import { pct, sqft } from '../../autofill';
import { BlockGrid, GridLegend } from '../../components/BlockGrid';
import { useWms } from '../../wms';
import { BlockPicker, NeedBlocks } from './shared';

export function GridStep({ blockCode, setBlockCode }: { blockCode: string; setBlockCode: (b: string) => void }) {
  const { structure: s, wh, run } = useWms();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const [use, setUse] = useState<CellUse>('OFFICE');
  const [name, setName] = useState('');
  if (!s) return null;
  if (!s.blocks.length) return <NeedBlocks />;
  const b = s.blocks.find((x) => x.code === blockCode) ?? s.blocks[0];

  const onCell = (r: number, c: number, shift: boolean) => {
    const next = new Set(sel);
    if (shift && anchor) {
      for (let i = Math.min(anchor[0], r); i <= Math.max(anchor[0], r); i++) for (let j = Math.min(anchor[1], c); j <= Math.max(anchor[1], c); j++) next.add(`${i},${j}`);
    } else {
      if (next.has(`${r},${c}`)) next.delete(`${r},${c}`); else next.add(`${r},${c}`);
      setAnchor([r, c]);
    }
    setSel(next);
  };
  const apply = async () => {
    const cells = [...sel].map((k) => { const [row, col] = k.split(',').map(Number); return { row, col }; });
    const ok = await run(() => api.paintCells(wh, b.code, { cells, use, areaName: name || CELL_USE_LABEL[use] }), `${cells.length} cell${cells.length === 1 ? '' : 's'} marked as ${name || CELL_USE_LABEL[use]}.`);
    if (ok) setSel(new Set());
  };

  const counts: Partial<Record<CellUse, number>> = {};
  b.cells.flat().forEach((u) => { counts[u] = (counts[u] ?? 0) + 1; });

  return (
    <div className="card pad">
      <div className="row" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
        <BlockPicker value={b.code} onChange={(v) => { setBlockCode(v); setSel(new Set()); }} />
        <p className="note" style={{ flex: 1, minWidth: 240 }}>Click cells to select (Shift+click selects a rectangle). Mark them as one area — e.g. a 2×2 Office. Everything not marked stays <b>Storage</b>.</p>
      </div>
      <div className="paint-bar">
        <label className="field">Area type
          <select value={use} onChange={(e) => setUse(e.target.value as CellUse)}>
            {(Object.keys(CELL_USE_LABEL) as CellUse[]).map((u) => <option key={u} value={u}>{CELL_USE_LABEL[u]}</option>)}
          </select>
        </label>
        <label className="field">Name <span className="hint">optional</span><input value={name} placeholder={CELL_USE_LABEL[use]} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={!sel.size} onClick={apply}>Mark {sel.size} selected cell{sel.size === 1 ? '' : 's'}</button>
        <button className="btn btn-ghost" onClick={() => setSel(new Set())}>Clear selection</button>
      </div>
      <GridLegend />
      <BlockGrid block={b} racks={s.racks} plates={s.plates} floorCells={s.floorCells} mode="design" selected={sel} onCell={onCell} />
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>Use</th><th className="num">Cells</th><th className="num">Area</th><th className="num">Share</th></tr></thead>
          <tbody>
            {(Object.keys(CELL_USE_LABEL) as CellUse[]).filter((u) => counts[u]).map((u) => (
              <tr key={u} className={u === 'STORAGE' ? 'sel' : ''}><td><b>{CELL_USE_LABEL[u]}</b></td><td className="num">{counts[u]}</td><td className="num">{sqft(counts[u]! * b.cellAreaSqft)}</td><td className="num">{pct(counts[u]!, b.rows * b.cols)}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8 }}>Exact storage area of {b.name}: <b>{sqft(b.storageSqft)}</b> of {sqft(b.areaSqft)}.</p>
    </div>
  );
}
