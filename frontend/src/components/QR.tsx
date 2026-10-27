import QRCode from 'qrcode';

/** QR code drawn as SVG (sharp when printed, no waiting for an image to load). */
export function QR({ text, size = 84 }: { text: string; size?: number }) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, q = 3; // quiet zone
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules.data[r * n + c]) d += `M${c + q} ${r + q}h1v1h-1z`;
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n + 2 * q} ${n + 2 * q}`} shapeRendering="crispEdges" role="img" aria-label={`QR code ${text}`}>
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}

export const unitQR = (uid: string) => `AZWMS|U|${uid}`;
export const locQR = (wh: string, code: string) => `AZWMS|L|${wh}|${code}`;
export const docQR = (no: string) => `AZWMS|D|${no}`;
