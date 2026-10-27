import { useWms } from '../../wms';

export function BlockPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const { structure: s } = useWms();
  return (
    <label className="field" style={{ maxWidth: 260 }}>Block
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {s?.blocks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
      </select>
    </label>
  );
}

export function NeedBlocks() {
  return <div className="card pad"><div className="empty">This warehouse has no blocks yet. Create the first block in step 2 — a whole warehouse can be a single block.</div></div>;
}
