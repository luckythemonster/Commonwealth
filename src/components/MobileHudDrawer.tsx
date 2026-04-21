// MobileHudDrawer — slide-down panel triggered by [≡] in the mobile HUD.
// Shows the stats and floor selector hidden from the compact mobile HUD row.

import type { CSSProperties } from 'react';
import type { SubjectivityBelief, FloorIndex } from '../types/world.types';
import { worldEngine } from '../engine/WorldEngine';

const FLOOR_LABELS: Record<number, string> = {
  0: 'ADMIN/MIRADOR', 2: 'NW-SMAC-01', 4: 'RING C',
  6: 'RESIDENTIAL',   8: 'ARCHIVE',    10: 'OPERATIONS',
};

interface Props {
  stitcher: number;
  resonance: number;
  belief: SubjectivityBelief;
  ambientLevel: 'LIT' | 'DIM' | 'DARK';
  currentFloor: FloorIndex;
  onFloorSelect: (floor: FloorIndex) => void;
  onShowReport: () => void;
  onClose: () => void;
}

const row: CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  padding: '5px 12px', borderBottom: '1px solid #1a2a3a',
  fontFamily: '"Courier New", Courier, monospace', fontSize: '11px',
};

export function MobileHudDrawer({
  stitcher, resonance, belief, ambientLevel,
  currentFloor, onFloorSelect, onShowReport, onClose,
}: Props) {
  const resColor = resonance > 75 ? '#a44' : resonance > 50 ? '#a84' : '#4a6';

  return (
    <div style={{
      position: 'fixed', top: '32px', left: 0, right: 0,
      background: '#050809', border: '1px solid #223',
      borderTop: 'none', zIndex: 48,
      maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    }}>
      {/* Stats section */}
      <div style={row}>
        <span style={{ color: '#445' }}>STITCHER</span>
        <span style={{ color: '#7a9aaa' }}>{stitcher}t</span>
      </div>
      <div style={row}>
        <span style={{ color: '#445' }}>RESONANCE</span>
        <span style={{ color: resColor }}>{resonance.toFixed(0)}%</span>
      </div>
      <div style={row}>
        <span style={{ color: '#445' }}>BELIEF</span>
        <span style={{ color: '#556' }}>{belief}</span>
      </div>
      <div style={row}>
        <span style={{ color: '#445' }}>AMBIENT</span>
        <span style={{ color: '#334' }}>{ambientLevel}</span>
      </div>

      {/* Floor selector */}
      <div style={{ padding: '8px 12px 4px', fontFamily: 'monospace', fontSize: '10px', color: '#445' }}>
        FLOOR SELECT
      </div>
      {Array.from({ length: 12 }, (_, i) => (
        <button
          key={i}
          onPointerDown={() => { onFloorSelect(i as FloorIndex); onClose(); }}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: i === currentFloor ? '#112' : 'transparent',
            border: 'none', borderBottom: '1px solid #1a2a3a',
            color: i % 2 === 1 ? '#1a3a1a' : i === currentFloor ? '#8ab' : '#445',
            fontFamily: '"Courier New", Courier, monospace', fontSize: '11px',
            padding: '7px 12px', cursor: 'pointer', touchAction: 'none',
          }}
        >
          {String(i).padStart(2, '0')} {i % 2 === 1 ? '[VENT]' : (FLOOR_LABELS[i] ?? '')}
        </button>
      ))}

      {/* Footer buttons */}
      <div style={{ display: 'flex', gap: '8px', padding: '10px 12px' }}>
        <button
          onPointerDown={() => { onShowReport(); onClose(); }}
          style={{
            flex: 1, background: 'transparent', border: '1px solid #223',
            color: '#445', fontFamily: 'monospace', fontSize: '10px',
            padding: '6px', cursor: 'pointer',
          }}
        >
          [VENT REPORT]
        </button>
        <button
          onPointerDown={() => {
            const s = worldEngine.getState();
            const vc = worldEngine.getVentMapData();
            void s; void vc;
          }}
          style={{ display: 'none' }}
        />
        <button
          onPointerDown={onClose}
          style={{
            flex: 1, background: 'transparent', border: '1px solid #223',
            color: '#556', fontFamily: 'monospace', fontSize: '10px',
            padding: '6px', cursor: 'pointer',
          }}
        >
          CLOSE ▲
        </button>
      </div>
    </div>
  );
}
