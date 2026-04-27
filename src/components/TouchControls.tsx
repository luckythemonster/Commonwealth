import { useRef } from 'react';
import { gameActions } from '../hooks/useGameActions';
import { worldEngine } from '../engine/WorldEngine';

interface Props {
  onToggleInventory: () => void;
}

const BTN: React.CSSProperties = {
  background: 'rgba(6,15,22,0.85)',
  border: '1px solid #2a4a5a',
  color: '#7a9aaa',
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '13px',
  borderRadius: 4,
  backdropFilter: 'blur(2px)',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const GHOST: React.CSSProperties = {
  ...BTN,
  opacity: 0,
  pointerEvents: 'none',
};

export function TouchControls({ onToggleInventory }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startRepeat(fn: () => void) {
    fn();
    intervalRef.current = setInterval(fn, 160);
  }

  function stopRepeat() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function dpadBtn(label: string, dx: number, dy: number) {
    return (
      <button
        style={{ ...BTN, width: 48, height: 48 }}
        onPointerDown={e => { e.preventDefault(); startRepeat(() => gameActions.tryMove(dx, dy)); }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 180, zIndex: 40,
      display: 'flex', alignItems: 'flex-end',
      justifyContent: 'space-between',
      padding: '0 16px 16px',
      pointerEvents: 'none',
    }}>

      {/* D-pad — left side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 48px)',
        gridTemplateRows: 'repeat(3, 48px)',
        gap: 4,
        pointerEvents: 'auto',
      }}>
        <div style={GHOST} />
        {dpadBtn('▲', 0, -1)}
        <div style={GHOST} />
        {dpadBtn('◀', -1, 0)}
        <div style={{ ...BTN, width: 48, height: 48, opacity: 0.3, pointerEvents: 'none' }}>·</div>
        {dpadBtn('▶', 1, 0)}
        <div style={GHOST} />
        {dpadBtn('▼', 0, 1)}
        <div style={GHOST} />
      </div>

      {/* Action buttons — right side */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        pointerEvents: 'auto',
      }}>
        {/* Floor row */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={{ ...BTN, width: 56, height: 48 }}
            onPointerDown={e => { e.preventDefault(); gameActions.tryChangeFloor(-1); }}
          >
            W▲
          </button>
          <button
            style={{ ...BTN, width: 56, height: 48 }}
            onPointerDown={e => { e.preventDefault(); gameActions.tryChangeFloor(1); }}
          >
            S▼
          </button>
        </div>

        {/* Interact */}
        <button
          style={{ ...BTN, width: 116, height: 48 }}
          onPointerDown={e => { e.preventDefault(); gameActions.tryInteract(); }}
        >
          E  ACT
        </button>

        {/* Inventory + End Turn */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={{ ...BTN, width: 56, height: 48 }}
            onPointerDown={e => { e.preventDefault(); onToggleInventory(); }}
          >
            I INV
          </button>
          <button
            style={{ ...BTN, width: 56, height: 48 }}
            onPointerDown={e => { e.preventDefault(); worldEngine.endTurn(); }}
          >
            T END
          </button>
        </div>
      </div>
    </div>
  );
}
