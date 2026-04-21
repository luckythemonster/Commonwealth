// useInput — keyboard handler for Sol's movement and interactions.
// Arrow keys: grid movement (x/y). W/S: floor navigation on stairwells.
// E: interact / enter-exit vent / toggle light / open elevator. T: end turn.
// All actions route through worldEngine — no state owned here.

import { useEffect, useCallback } from 'react';
import { worldEngine } from '../engine/WorldEngine';
import { eventBus } from '../engine/EventBus';
import type { FloorIndex, Vec3 } from '../types/world.types';

const VENT_FLOORS: Record<number, true> = { 1: true, 3: true, 5: true, 7: true, 9: true, 11: true };
const NAMED_ENTITY_IDS = ['EIRA-7', 'APEX-19', 'ALFAR-22', 'ROWAN', 'ERSO', 'CLERK'];
const SILICATE_IDS     = new Set(['EIRA-7', 'APEX-19', 'ALFAR-22']);

interface Options {
  onRefresh: (floor: FloorIndex) => void;
  onOpenTerminal: (entityId: string) => void;
  onEndTurn: () => void;
  onOpenInventory: () => void;
  onOpenElevator: () => void;
}

export function useInput({ onRefresh, onOpenTerminal, onEndTurn, onOpenInventory, onOpenElevator }: Options) {
  const tryMove = useCallback((dx: number, dy: number) => {
    const state = worldEngine.getState();
    const { pos } = state.playerState;
    const to: Vec3 = { x: pos.x + dx, y: pos.y + dy, z: pos.z };

    const tile = state.grid[to.z]?.[to.y]?.[to.x];
    if (!tile || tile.type === 'WALL' || tile.type === 'VOID') return;
    if (tile.type === 'DOOR' && tile.doorOpen !== true) return;

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

    // 1. Item pickup on own tile
    if ((selfTile as typeof selfTile & { itemId?: string })?.itemId) {
      const picked = worldEngine.pickup(pos);
      if (picked) { onRefresh(pos.z as FloorIndex); return; }
    }

    // 2. VENT_ENTRY: enter vent from main floor (z even → z+1)
    if (selfTile?.type === 'VENT_ENTRY' && pos.z % 2 === 0) {
      const ventZ = (pos.z + 1) as FloorIndex;
      const ventTile = state.grid[ventZ]?.[pos.y]?.[pos.x];
      if (ventTile && ventTile.type !== 'VOID' && ventTile.type !== 'WALL') {
        const ok = worldEngine.move({ x: pos.x, y: pos.y, z: ventZ });
        if (ok) { onRefresh(ventZ); return; }
      }
    }

    // 3. VENT_ENTRY: exit vent up to floor above (z odd → z-1)
    if (pos.z % 2 === 1 && selfTile?.type === 'VENT_ENTRY') {
      const floorZ = (pos.z - 1) as FloorIndex;
      const ok = worldEngine.move({ x: pos.x, y: pos.y, z: floorZ });
      if (ok) { onRefresh(floorZ); return; }
    }

    // 4. VENT_EXIT_DOWN: exit vent down to floor below (z odd → z+1)
    if (pos.z % 2 === 1 && selfTile?.type === 'VENT_EXIT_DOWN') {
      const floorZ = (pos.z + 1) as FloorIndex;
      const ok = worldEngine.move({ x: pos.x, y: pos.y, z: floorZ });
      if (ok) { onRefresh(floorZ); return; }
    }

    // 5. LIGHT_SOURCE: toggle adjacent ceiling panel
    for (const { dx, dy } of [{ dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}]) {
      const lt = state.grid[pos.z]?.[pos.y + dy]?.[pos.x + dx];
      if (lt?.type === 'LIGHT_SOURCE') {
        worldEngine.toggleLight({ x: pos.x + dx, y: pos.y + dy, z: pos.z });
        onRefresh(pos.z as FloorIndex);
        return;
      }
    }

    // 6. ELEVATOR: open floor selection modal
    if (selfTile?.type === 'ELEVATOR') {
      onOpenElevator();
      return;
    }

    // 7. Door interaction (4-cardinal adjacents)
    for (const { dx, dy } of [{ dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}]) {
      const dt = state.grid[pos.z]?.[pos.y + dy]?.[pos.x + dx];
      if (dt?.type !== 'DOOR') continue;
      const doorPos: Vec3 = { x: pos.x + dx, y: pos.y + dy, z: pos.z };

      if (dt.locked && !dt.doorOpen) {
        // Try inventory key first, then lockpick, then report blocked
        const opened = worldEngine.unlockDoor(doorPos);
        if (!opened) {
          const lockpick = state.playerState.inventory.find(i => i.type === 'LOCKPICK');
          if (lockpick) {
            worldEngine.useItem(lockpick.id, doorPos);
          } else {
            eventBus.emit('DOOR_LOCKED_BLOCKED', { pos: doorPos });
          }
        }
      } else {
        worldEngine.toggleDoor(doorPos);
      }
      onRefresh(pos.z as FloorIndex);
      return;
    }

    // 8. Named entities and terminals (adjacent + self tile)
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
          if (SILICATE_IDS.has(id)) {
            worldEngine.logViolation('SILICATE_INTERACTION', pos);
          }
          onOpenTerminal(id);
          return;
        }
      }

      if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
        worldEngine.logTerminalAccess(pos.z);
        const defaultId = pos.z === 2 ? 'EIRA-7' : pos.z === 4 ? 'ALFAR-22' : 'EIRA-7';
        onOpenTerminal(defaultId);
        return;
      }
    }
  }, [onOpenTerminal, onRefresh, onOpenElevator]);

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
        case 'e': case 'E': tryInteract();     break;
        case 't': case 'T': onEndTurn();       break;
        case 'i': case 'I': onOpenInventory(); break;
        default: return;
      }
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tryMove, tryChangeFloor, tryInteract, onEndTurn, onOpenInventory]);
}
