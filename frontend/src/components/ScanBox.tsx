import { useState } from 'react';

/**
 * Text box for a handheld scanner or typing: scanners type the code and press Enter.
 * Calls onScan with the raw text and clears itself.
 */
export function ScanBox({ placeholder, onScan, autoFocus }: { placeholder: string; onScan: (code: string) => void | Promise<void>; autoFocus?: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="scan-box">
      <input value={v} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus} aria-label={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={async (e) => { if (e.key === 'Enter' && v.trim()) { const code = v; setV(''); await onScan(code); } }} />
      <button className="btn btn-sm" disabled={!v.trim()} onClick={async () => { const code = v; setV(''); await onScan(code); }}>Add</button>
    </div>
  );
}
