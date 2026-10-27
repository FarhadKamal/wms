import { useState } from 'react';
import { useWms } from '../wms';
import { BlocksStep } from './setup/BlocksStep';
import { GridStep } from './setup/GridStep';
import { PlatesStep } from './setup/PlatesStep';
import { RacksStep } from './setup/RacksStep';
import { TypesStep } from './setup/TypesStep';
import { WarehouseStep } from './setup/WarehouseStep';

export type SetupStep = 'warehouse' | 'blocks' | 'grid' | 'types' | 'racks' | 'plates';
const STEPS: Array<[SetupStep, string]> = [
  ['warehouse', 'Warehouse'], ['blocks', 'Blocks'], ['grid', 'Block grid & areas'], ['types', 'Rack & plate types'], ['racks', 'Racks'], ['plates', 'Plates'],
];

export function SetupPage({ initialRack }: { initialRack?: { block: string; rack: string } | null }) {
  const { structure } = useWms();
  const fromHash = window.location.hash.split('/')[2] as SetupStep | undefined;
  const [step, setStepState] = useState<SetupStep>(initialRack ? 'racks' : STEPS.some(([id]) => id === fromHash) ? fromHash! : 'warehouse');
  const setStep = (s: SetupStep) => { setStepState(s); window.location.hash = `/setup/${s}`; };
  const [blockCode, setBlockCode] = useState(initialRack?.block ?? '');
  const [rackCode, setRackCode] = useState<string | null>(initialRack?.rack ?? null);
  const block = blockCode || structure?.blocks[0]?.code || '';

  return (
    <>
      <div className="steps">
        {STEPS.map(([id, label], i) => (
          <button key={id} className={`step${step === id ? ' active' : ''}`} onClick={() => setStep(id)}>
            <div className="n">STEP {i + 1}</div><div className="t">{label}</div>
          </button>
        ))}
      </div>
      {step === 'warehouse' && <WarehouseStep onCreated={() => setStep('blocks')} />}
      {step === 'blocks' && <BlocksStep onEditGrid={(b) => { setBlockCode(b); setStep('grid'); }} />}
      {step === 'grid' && <GridStep blockCode={block} setBlockCode={setBlockCode} />}
      {step === 'types' && <TypesStep />}
      {step === 'racks' && <RacksStep blockCode={block} setBlockCode={setBlockCode} rackCode={rackCode} setRackCode={setRackCode} />}
      {step === 'plates' && <PlatesStep blockCode={block} setBlockCode={setBlockCode} />}
    </>
  );
}
