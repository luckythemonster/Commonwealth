// useInput — keyboard handler for Sol's movement and interactions.
// Arrow/WASD: move. E: interact with adjacent entity. T: end turn.
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

    // Vent traversal: player must be on a VENT_ENTRY tile to enter vent layer
    const targetIsVent = VENT_FLOORS[to.z];
    if (targetIsVent) {
      const ok = worldEngine.traverse(to);
      if (ok) onRefresh(to.z as FloorIndex);
      return;
    }

    // Stairwell: move between floors
    if (tile.type === 'STAIRWELL') {
      const upDown = dy < 0 ? -1 : 1; // up arrow = go up a floor (lower z? let's use +z as down)
      const newZ = Math.max(0, Math.min(11, pos.z + upDown)) as FloorIndex;
      const stairTo: Vec3 = { x: to.x, y: to.y, z: newZ };
      const ok = worldEngine.move(stairTo);
      if (ok) onRefresh(newZ);
      return;
    }

    const ok = worldEngine.move(to);
    if (ok) onRefresh(to.z as FloorIndex);
  }, [onRefresh]);

  const tryInteract = useCallback(() => {
    const state = worldEngine.getState();
    const { pos } = state.playerState;

    // Check all 4 adjacent tiles for a named entity
    const adjacentOffsets = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 0, dy: 0 }, // same tile
    ];

    for (const { dx, dy } of adjacentOffsets) {
      const tx = pos.x + dx;
      const ty = pos.y + dy;
      const tile = state.grid[pos.z]?.[ty]?.[tx];
      if (!tile) continue;

      // Named entity on this tile?
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

      // Terminal tile — open generic audit
      if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
        // For now open EIRA-7 as default terminal entity on floor 3, else ALFAR-22
        const defaultId = pos.z === 3 ? 'EIRA-7' : pos.z === 4 ? 'ALFAR-22' : 'EIRA-7';
        onOpenTerminal(defaultId);
        return;
      }
    }
  }, [onOpenTerminal]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': tryMove(0, -1);  break;
        case 'ArrowDown':  case 's': case 'S': tryMove(0,  1);  break;
        case 'ArrowLeft':  case 'a': case 'A': tryMove(-1, 0);  break;
        case 'ArrowRight': case 'd': case 'D': tryMove(1,  0);  break;
        case 'e': case 'E': tryInteract();  break;
        case 't': case 'T': onEndTurn();    break;
        default: return;
      }
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tryMove, tryInteract, onEndTurn]);
}
