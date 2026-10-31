import type { Block, FloorCell, Plate, Rack } from '../api';
import { CELL_USE_LABEL } from '../api';

interface Props {
  block: Block;
  racks: Rack[];
  plates: Plate[];
  floorCells: FloorCell[];
  /** design: cells are selectable (Setup step 3); view: racks and storage cells are clickable */
  mode: 'view' | 'design';
  selected?: Set<string>;
  selectedRack?: string | null;
  onCell?: (row: number, col: number, shift: boolean) => void;
  onRack?: (code: string) => void;
}

const key = (r: number, c: number) => `${r},${c}`;

export function rackCells(rk: Rack): Array<[number, number]> {
  return Array.from({ length: rk.lengthCells }, (_, i) => (rk.direction === 'ROW' ? [rk.startRow, rk.startCol + i] : [rk.startRow + i, rk.startCol]));
}

export function BlockGrid({ block: b, racks, plates, floorCells, mode, selected, selectedRack, onCell, onRack }: Props) {
  const inBlock = racks.filter((r) => r.blockCode === b.code);
  const under = new Set(inBlock.flatMap((r) => rackCells(r).map(([rr, cc]) => key(rr, cc))));
  const cellPlates = new Map<string, Plate[]>();
  for (const p of plates) {
    if (p.parent.kind === 'CELL' && p.parent.blockCode === b.code) {
      const k = key(p.parent.row, p.parent.col);
      cellPlates.set(k, [...(cellPlates.get(k) ?? []), p]);
    }
  }
  const floor = new Map(floorCells.filter((f) => f.blockCode === b.code).map((f) => [key(f.row, f.col), f]));
  const shown = new Set<string>();
  const items = [];

  for (let r = 1; r <= b.rows; r++) {
    for (let c = 1; c <= b.cols; c++) {
      if (under.has(key(r, c))) continue;
      const use = b.cells[r - 1][c - 1];
      const label = b.names[key(r, c)] || CELL_USE_LABEL[use];
      const cont = use !== 'STORAGE' && shown.has(use + label);
      shown.add(use + label);
      const style = { gridRow: r + 1, gridColumn: c + 1 };
      const ps = cellPlates.get(key(r, c)) ?? [];
      const fc = floor.get(key(r, c));
      const stocked = (fc?.units ?? 0) > 0 || ps.some((p) => p.units > 0);
      const body = use === 'STORAGE'
        ? (
          <>
            <span className="t1">{ps.length ? `${ps.length} plate${ps.length > 1 ? 's' : ''}` : 'Floor'}</span>
            {ps.length > 0 && <span className="plates-mini">{ps.map((p) => <span key={p.label} className={p.units ? '' : 'e'} />)}</span>}
            <span className="t2">{mode === 'design' ? `R${r}C${c}` : stocked ? `${(fc?.units ?? 0) + ps.reduce((s, p) => s + p.units, 0)} pcs` : 'empty'}</span>
          </>
        )
        : (<><span className="t1">{label}</span>{mode === 'design' && <span className="t2">R{r}C{c}</span>}</>);
      const cls = `gcell ${use}${cont ? ' cont' : ''}${stocked ? ' stocked' : ''}${selected?.has(key(r, c)) ? ' sel' : ''}`;
      items.push(mode === 'design'
        ? <button key={key(r, c)} className={cls} style={style} onClick={(e) => onCell?.(r, c, e.shiftKey)} title={`R${r}C${c}`}>{body}</button>
        : use === 'STORAGE' && onCell
          ? <button key={key(r, c)} className={cls} style={style} onClick={() => onCell(r, c, false)} title={`${b.code}-R${r}C${c}`}>{body}</button>
          : <div key={key(r, c)} className={cls} style={style}>{body}</div>);
    }
  }

  for (const rk of inBlock) {
    const full = rk.shelves.some((s) => s.band === 'full');
    const style = {
      gridRow: `${rk.startRow + 1} / span ${rk.direction === 'COLUMN' ? rk.lengthCells : 1}`,
      gridColumn: `${rk.startCol + 1} / span ${rk.direction === 'ROW' ? rk.lengthCells : 1}`,
    };
    items.push(
      <button key={rk.code} className={`rack-el${full ? ' full' : ''}${selectedRack === rk.code ? ' sel' : ''}`} style={style}
        onClick={() => onRack?.(rk.code)} disabled={!onRack}>
        <span className="rn">{rk.name}{full && <span className="wfull">⚠ WEIGHT FULL</span>}</span>
        <span className="rm">{rk.rackType.name} · {rk.bays ? `${rk.bays} bays` : 'no bays'} · {rk.shelves.length} shelves{rk.plates ? ` · ${rk.plates} plates` : ''}</span>
        <span className="pips">{rk.shelves.map((s) => <span key={s.level} className={`pip ${s.band === 'empty' ? '' : s.band}`} title={`Shelf ${s.level}: ${Math.round(s.usedKg)}/${s.capKg} kg`} />)}</span>
      </button>,
    );
  }

  return (
    <div className="grid-wrap">
      {/* Cells are square on the floor (block area ÷ cells), so they are drawn square: same width and height. */}
      <div className="bgrid" style={{ gridTemplateColumns: `28px repeat(${b.cols}, var(--cell))`, gridTemplateRows: `20px repeat(${b.rows}, var(--cell))` }}>
        <div className="hd" />
        {Array.from({ length: b.cols }, (_, i) => <div key={`c${i}`} className="hd" style={{ gridRow: 1, gridColumn: i + 2 }}>C{i + 1}</div>)}
        {Array.from({ length: b.rows }, (_, i) => <div key={`r${i}`} className="hd" style={{ gridRow: i + 2, gridColumn: 1 }}>R{i + 1}</div>)}
        {items}
      </div>
    </div>
  );
}

export function GridLegend() {
  return (
    <div className="legend">
      {(Object.keys(CELL_USE_LABEL) as Array<keyof typeof CELL_USE_LABEL>).map((u) => (
        <span key={u} className="li"><span className={`gcell ${u}`} style={{ minHeight: 0, width: 14, height: 14, padding: 0, borderRadius: 4 }} />{CELL_USE_LABEL[u]}</span>
      ))}
      <span className="li"><span className="sw" style={{ background: 'var(--primary-soft)', border: '2px solid var(--primary)' }} />Rack</span>
      <span className="li"><span className="plates-mini"><span /></span>Plate</span>
      <span className="li"><span className="wfull">⚠</span> Shelf at weight limit</span>
    </div>
  );
}
