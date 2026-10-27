import { useEffect, useState } from 'react';
import { api } from '../../api';
import { cellFacts, gridFor, plural, sqft } from '../../autofill';
import { useWms } from '../../wms';

export function BlocksStep({ onEditGrid }: { onEditGrid: (block: string) => void }) {
  const { structure: s, wh, run } = useWms();
  const free = s ? Math.max(0, s.warehouse.areaSqft - s.summary.blockAreaSqft) : 0;
  const nextLetter = s ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !s.blocks.some((b) => b.code === l)) ?? '' : '';
  const [f, setF] = useState({ name: '', areaSqft: 0, cellSqft: 16, rows: 1, cols: 1, clearHeightCm: 400, note: '' });

  // Auto-fill: next block name, all the free area, rows × columns for a 16 sq ft cell.
  useEffect(() => {
    const g = gridFor(free, 16);
    setF((x) => ({ ...x, name: `Block ${nextLetter}`, areaSqft: Math.round(free), cellSqft: 16, rows: g.rows, cols: g.cols }));
  }, [free, nextLetter]);
  if (!s) return null;

  const setArea = (areaSqft: number, cellSqft = f.cellSqft) => setF({ ...f, areaSqft, cellSqft, ...gridFor(areaSqft, cellSqft) });
  const setGrid = (rows: number, cols: number) => setF({ ...f, rows, cols, cellSqft: Math.round((f.areaSqft / Math.max(1, rows * cols)) * 10) / 10 });
  const facts = cellFacts(f.areaSqft, f.rows, f.cols);

  return (
    <div className="stack">
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Block</th><th className="num">Area (sq ft)</th><th className="num">Rows</th><th className="num">Columns</th><th className="num">Per cell</th><th className="num">Storage</th><th className="num">Racks</th><th /></tr></thead>
          <tbody>
            {s.blocks.map((b) => (
              <tr key={`${b.code}-${b.areaSqft}-${b.rows}-${b.cols}`}>
                <td><b>{b.name}</b><div className="note">{b.note}</div></td>
                <td className="num"><input className="inline-input" type="number" defaultValue={b.areaSqft} onBlur={(e) => Number(e.target.value) !== b.areaSqft && run(() => api.updateBlock(wh, b.code, { areaSqft: Number(e.target.value) }), `${b.name} updated.`)} /></td>
                <td className="num"><input className="inline-input" style={{ width: 64 }} type="number" defaultValue={b.rows} onBlur={(e) => Number(e.target.value) !== b.rows && run(() => api.updateBlock(wh, b.code, { rows: Number(e.target.value) }), `${b.name} updated.`)} /></td>
                <td className="num"><input className="inline-input" style={{ width: 64 }} type="number" defaultValue={b.cols} onBlur={(e) => Number(e.target.value) !== b.cols && run(() => api.updateBlock(wh, b.code, { cols: Number(e.target.value) }), `${b.name} updated.`)} /></td>
                <td className="num">{Math.round(b.cellAreaSqft)} sq ft</td>
                <td className="num">{sqft(b.storageSqft)}</td>
                <td className="num">{s.racks.filter((r) => r.blockCode === b.code).length}</td>
                <td><button className="btn btn-xs" onClick={() => onEditGrid(b.code)}>Edit grid →</button></td>
              </tr>
            ))}
            {!s.blocks.length && <tr><td colSpan={8} className="empty">No blocks yet — a whole warehouse can be a single block.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Blocks use {sqft(s.summary.blockAreaSqft)} of {sqft(s.warehouse.areaSqft)}. Each block's area is split equally across its grid cells. Changes are refused if a rack or stock would no longer fit.</p>

      <div className="card pad" style={{ maxWidth: 880 }}>
        <div className="section-title">Add a block</div>
        <div className="form-grid" style={{ ['--cols' as string]: 4 }}>
          <label className="field">Name <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Area (sq ft) <span className="hint">auto: area still free</span><input type="number" min={1} value={f.areaSqft} onChange={(e) => setArea(Number(e.target.value))} /></label>
          <label className="field">Cell size (sq ft) <span className="hint">sets rows × columns</span><input type="number" min={1} step={0.5} value={f.cellSqft} onChange={(e) => setArea(f.areaSqft, Number(e.target.value))} /></label>
          <label className="field">Clear height (cm) <input type="number" min={100} value={f.clearHeightCm} onChange={(e) => setF({ ...f, clearHeightCm: Number(e.target.value) })} /></label>
          <label className="field">Rows <input type="number" min={1} max={30} value={f.rows} onChange={(e) => setGrid(Number(e.target.value), f.cols)} /></label>
          <label className="field">Columns <input type="number" min={1} max={20} value={f.cols} onChange={(e) => setGrid(f.rows, Number(e.target.value))} /></label>
          <label className="field" style={{ gridColumn: 'span 2' }}>Note <input value={f.note} placeholder="What is stored here" onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          {f.areaSqft > 0
            ? <>= <b>{Math.round(facts.perCellSqft * 10) / 10} sq ft per cell</b> (≈ {Math.round(facts.sideCm)} × {Math.round(facts.sideCm)} cm) · {plural(facts.cells, 'cell')} · {plural(facts.palletsPerCell, 'floor pallet')} per cell · Type A rack ≈ {plural(facts.rackCells, 'cell')} long</>
            : 'No area left in this warehouse — increase its total area in step 1 first.'}
        </p>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!f.name || f.areaSqft <= 0}
            onClick={() => run(() => api.createBlock(wh, { name: f.name, areaSqft: f.areaSqft, rows: f.rows, cols: f.cols, clearHeightCm: f.clearHeightCm, note: f.note }), `${f.name} added (${f.rows}×${f.cols} cells).`)}>
            Add block
          </button>
          <span className="note">All cells start as Storage; mark offices, passages etc. in step 3.</span>
        </div>
      </div>
    </div>
  );
}
