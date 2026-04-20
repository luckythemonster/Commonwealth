// useInput — keyboard handler for Sol's movement and interactions.
// Arrow keys: grid movement (x/y). W/S: floor navigation on stairwells.
// E: interact / enter-exit vent. T: end turn.
// All actions route through worldEngine — no state owned here.

import { useEffect, useCallback } from 'react';
import { worldEngine } from '../engine/WorldEngine';
import type { FloorIndex, Vec3 } from '../types/world.types';

const VENT_FLOORS: Record<number, true> = { 1: true, 3: true, 5: true, 7: true, 9: true, 11: true };
const NAMED_ENTITY_IDS = ['EIRA-7', 'APEX-19', 'ALFAR-22', 'ROWAN', 'ERSO', 'CLERK'];

interface Options {
  onRefresh: (floor: FloorIndex) => void;
  onOpenTerminal: (entityId: string) => void;
  onEndTurn: () => void;
}

export function useInput({ onRefresh, onOpenTerminal, onEndTurn }: Options) {
  const tryMove = useCallback((dx: number, dy: number) => {
    const state = worldEngine.getState();
    const { pos } = state.playerState;
    const to: Vec3 = { x: pos.x + dx, y: pos.y + dy, z: pos.z };

    // Bounds check
    const tile = state.grid[to.z]?.[to.y]?.[to.x];
    if (!tile || tile.type === 'WALL' || tile.type === 'VOID') return;

    // Already on a vent layer — all horizontal movement is vent traversal
    if (VENT_FLOORS[pos.z]) {
      const ok = worldEngine.traverse(to);
      if (ok) onRefresh(to.z as FloorIndex);
      return;
    }

    const ok = worldEngine.move(to);
    if (ok) onRefresh(to.z as FloorIndex);
  }, [onRefresh]);

  const tryInteract = useCallback(() => {
    const state = worldEngine.getState();
    const { pos } = state.playerState;

    const selfTile = state.grid[pos.z]?.[pos.y]?.[pos.x];

    // VENT_ENTRY: E on a grate tile enters the vent layer below (z+1)
    if (selfTile?.type === 'VENT_ENTRY' && pos.z % 2 === 0) {
      const ventZ = (pos.z + 1) as FloorIndex;
      const ventTile = state.grid[ventZ]?.[pos.y]?.[pos.x];
      if (ventTile && ventTile.type !== 'VOID' && ventTile.type !== 'WALL') {
        const ok = worldEngine.move({ x: pos.x, y: pos.y, z: ventZ });
        if (ok) { onRefresh(ventZ); return; }
      }
    }

    // Vent exit: E on a VENT_ENTRY tile in the vent layer exits to the floor above.
    // These green grate tiles mirror the VENT_ENTRY positions stamped at grid build time.
    if (pos.z % 2 === 1 && selfTile?.type === 'VENT_ENTRY') {
      const floorZ = (pos.z - 1) as FloorIndex;
      const ok = worldEngine.move({ x: pos.x, y: pos.y, z: floorZ });
      if (ok) { onRefresh(floorZ); return; }
    }

    // Check all adjacent + same tile for named entities and terminals
    const adjacentOffsets = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 0, dy: 0 },
    ];

    for (const { dx, dy } of adjacentOffsets) {
      const tx = pos.x + dx;
      const ty = pos.y + dy;
      const tile = state.grid[pos.z]?.[ty]?.[tx];
      if (!tile) continue;

      for (const id of NAMED_ENTITY_IDS) {
        const entity = worldEngine.getEntity(id);
        if (
          entity &&
          entity.status === 'ACTIVE' &&
          entity.pos.z === pos.z &&
          entity.pos.x === tx &&
          entity.pos.y === ty
        ) {
          onOpenTerminal(id);
          return;
        }
      }

      if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
        const defaultId = pos.z === 2 ? 'EIRA-7' : pos.z === 4 ? 'ALFAR-22' : 'EIRA-7';
        onOpenTerminal(defaultId);
        return;
      }
    }
  }, [onOpenTerminal, onRefresh]);

  const tryChangeFloor = useCallback((dir: -1 | 1) => {
    const state = worldEngine.getState();
    const { pos } = state.playerState;
    const selfTile = state.grid[pos.z]?.[pos.y]?.[pos.x];
    if (selfTile?.type !== 'STAIRWELL') return;
    const newZ = pos.z + dir * 2;
    if (newZ < 0 || newZ > 10) return;
    const ok = worldEngine.move({ x: pos.x, y: pos.y, z: newZ as FloorIndex });
    if (ok) onRefresh(newZ as FloorIndex);
  }, [onRefresh]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowUp':    tryMove(0, -1);   break;
        case 'ArrowDown':  tryMove(0,  1);   break;
        case 'ArrowLeft':  tryMove(-1, 0);   break;
        case 'ArrowRight': tryMove(1,  0);   break;
        case 'w': case 'W': tryChangeFloor(-1); break;
        case 's': case 'S': tryChangeFloor(1);  break;
        case 'e': case 'E': tryInteract();   break;
        case 't': case 'T': onEndTurn();     break;
        default: return;
      }
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tryMove, tryChangeFloor, tryInteract, onEndTurn]);
}
