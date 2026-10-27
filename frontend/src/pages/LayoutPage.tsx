import { useState } from 'react';
import { plural, sqft } from '../autofill';
import { BlockGrid, GridLegend } from '../components/BlockGrid';
import { RackDrawer } from '../components/RackDrawer';
import { useWms } from '../wms';

export function LayoutPage({ onConfigureRack }: { onConfigureRack: (block: string, rack: string) => void }) {
  const { structure: s } = useWms();
  const [blockCode, setBlockCode] = useState('');
  const [rackCode, setRackCode] = useState<string | null>(null);
  if (!s) return null;
  if (!s.blocks.length) return <div className="card pad"><div className="empty">No blocks yet. Create them in Warehouse Setup.</div></div>;
  const b = s.blocks.find((x) => x.code === blockCode) ?? s.blocks[0];
  const rack = s.racks.find((r) => r.code === rackCode) ?? null;

  return (
    <>
      <div className="tabs">
        {s.blocks.map((x) => (
          <button key={x.code} className={`tab${x.code === b.code ? ' active' : ''}`} onClick={() => setBlockCode(x.code)}>{x.name}<small>{sqft(x.areaSqft)}</small></button>
        ))}
      </div>
      <div className="card pad">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div><b style={{ fontFamily: 'Archivo, sans-serif', fontSize: 16 }}>{b.name}</b> <span className="note">{b.note}</span></div>
          <div className="note">{sqft(b.areaSqft)} · {b.rows} rows × {b.cols} columns · {Math.round(b.cellAreaSqft)} sq ft per cell · storage <b>{sqft(b.storageSqft)}</b></div>
        </div>
        <GridLegend />
        <BlockGrid block={b} racks={s.racks} plates={s.plates} floorCells={s.floorCells} mode="view" onRack={setRackCode} />
        <p className="note" style={{ marginTop: 10 }}>
          {plural(s.racks.filter((r) => r.blockCode === b.code).length, 'rack')} in this block. Click a rack to see its shelves with weight and space per shelf.
        </p>
      </div>
      {rack && <RackDrawer rack={rack} plates={s.plates} onClose={() => setRackCode(null)} onConfigure={() => onConfigureRack(rack.blockCode, rack.code)} />}
    </>
  );
}
