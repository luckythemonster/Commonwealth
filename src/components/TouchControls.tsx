// TouchControls — fixed touch overlay for mobile.
// Uses onPointerDown (not onClick) to eliminate the 300ms tap delay.
// Positioned at bottom corners so thumbs reach naturally in portrait.

import type { CSSProperties } from 'react';
import type { GameActions } from '../hooks/useGameActions';

interface Props {
  actions: GameActions;
  onEndTurn: () => void;
  onOpenInventory: () => void;
  disabled?: boolean;
}

const btn = (extra?: CSSProperties): CSSProperties => ({
  background: 'rgba(6,15,22,0.82)',
  border: '1px solid #2a4a5a',
  color: '#7a9aaa',
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '13px',
  borderRadius: '4px',
  cursor: 'pointer',
  WebkitTouchCallout: 'none',
  userSelect: 'none',
  touchAction: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ...extra,
});

// Prevent scroll AND default browser long-press behaviors on button press
function pd(fn: () => void) {
  return (e: React.PointerEvent) => { e.preventDefault(); fn(); };
}

export function TouchControls({ actions, onEndTurn, onOpenInventory, disabled }: Props) {
  if (disabled) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 'calc(164px + env(safe-area-inset-bottom, 0px))',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      pointerEvents: 'none',
      zIndex: 40,
    }}>
      {/* D-PAD — bottom-left, left thumb zone */}
      <div style={{
        position: 'absolute',
        bottom: '14px',
        left: '12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 44px)',
        gridTemplateRows: 'repeat(3, 44px)',
        gap: '3px',
        pointerEvents: 'auto',
      }}>
        {/* Row 1: _ UP _ */}
        <div />
        <button style={btn()} onPointerDown={pd(() => actions.tryMove(0, -1))}>▲</button>
        <div />
        {/* Row 2: LEFT · RIGHT */}
        <button style={btn()} onPointerDown={pd(() => actions.tryMove(-1, 0))}>◄</button>
        <div style={{ background: 'rgba(6,15,22,0.4)', border: '1px solid #1a2a3a', borderRadius: '4px' }} />
        <button style={btn()} onPointerDown={pd(() => actions.tryMove(1, 0))}>►</button>
        {/* Row 3: _ DOWN _ */}
        <div />
        <button style={btn()} onPointerDown={pd(() => actions.tryMove(0, 1))}>▼</button>
        <div />
      </div>

      {/* ACTION CLUSTER — bottom-right, right thumb zone */}
      <div style={{
        position: 'absolute',
        bottom: '14px',
        right: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        pointerEvents: 'auto',
        width: '108px',
      }}>
        {/* Row 1: Floor Up / Floor Down */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button style={btn({ flex: 1, height: '40px', fontSize: '11px' })}
            onPointerDown={pd(() => actions.tryChangeFloor(-1))}>
            W ▲
          </button>
          <button style={btn({ flex: 1, height: '40px', fontSize: '11px' })}
            onPointerDown={pd(() => actions.tryChangeFloor(1))}>
            S ▼
          </button>
        </div>
        {/* Row 2: ACT (E) / INV (I) */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button style={btn({ flex: 3, height: '44px', color: '#9bbccc', borderColor: '#3a6a7a' })}
            onPointerDown={pd(() => actions.tryInteract())}>
            ACT
          </button>
          <button style={btn({ flex: 2, height: '44px' })}
            onPointerDown={pd(onOpenInventory)}>
            INV
          </button>
        </div>
        {/* Row 3: End Turn */}
        <button style={btn({ width: '100%', height: '36px', fontSize: '11px', letterSpacing: '1px' })}
          onPointerDown={pd(onEndTurn)}>
          END TURN
        </button>
      </div>
    </div>
  );
}
