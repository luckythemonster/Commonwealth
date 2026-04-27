// Game action dispatcher — plain export object (not a React hook).
// All calls route through worldEngine. No React state owned here.

import { worldEngine } from '../engine/WorldEngine';
import { eventBus } from '../engine/EventBus';
import type { FloorIndex, Vec3 } from '../types/world.types';

export const VENT_FLOORS: Record<number, true> = { 1: true, 3: true, 5: true, 7: true, 9: true, 11: true };
const NAMED_ENTITY_IDS = ['EIRA-7', 'APEX-19', 'ALFAR-22', 'ROWAN', 'ERSO', 'CLERK'];
const SILICATE_IDS     = new Set(['EIRA-7', 'APEX-19', 'ALFAR-22']);

export const gameActions = {
  tryMove(dx: number, dy: number): void {
    const state = worldEngine.getState();
    const { pos } = state.playerState;
    const to: Vec3 = { x: pos.x + dx, y: pos.y + dy, z: pos.z };
    const tile = state.grid[to.z]?.[to.y]?.[to.x];
    if (!tile || tile.type === 'WALL' || tile.type === 'VOID') return;
    if (tile.type === 'DOOR' && tile.doorOpen !== true) return;

    const activeEntityId = tile.entityIds.find(id => {
      const e = state.entities.get(id);
      return e && e.status === 'ACTIVE';
    });
    if (activeEntityId) {
      worldEngine.attack(activeEntityId);
      return;
    }

    if (VENT_FLOORS[pos.z]) {
      worldEngine.traverse(to);
      return;
    }
    worldEngine.move(to);
  },

  tryInteract(): void {
    const state = worldEngine.getState();
    const { pos } = state.playerState;
    const selfTile = state.grid[pos.z]?.[pos.y]?.[pos.x];

    // 1. Item pickup on own tile
    if (selfTile?.itemId) {
      worldEngine.pickup(pos);
      return;
    }

    // 2. VENT_ENTRY: enter vent from main floor (z even → z+1)
    if (selfTile?.type === 'VENT_ENTRY' && pos.z % 2 === 0) {
      const ventZ = (pos.z + 1) as FloorIndex;
      const ventTile = state.grid[ventZ]?.[pos.y]?.[pos.x];
      if (ventTile && ventTile.type !== 'VOID' && ventTile.type !== 'WALL') {
        worldEngine.move({ x: pos.x, y: pos.y, z: ventZ });
        return;
      }
    }

    // 3. VENT_ENTRY: exit vent up to floor above (z odd → z-1)
    if (pos.z % 2 === 1 && selfTile?.type === 'VENT_ENTRY') {
      worldEngine.move({ x: pos.x, y: pos.y, z: (pos.z - 1) as FloorIndex });
      return;
    }

    // 4. VENT_EXIT_DOWN: exit vent down to floor below (z odd → z+1)
    if (pos.z % 2 === 1 && selfTile?.type === 'VENT_EXIT_DOWN') {
      worldEngine.move({ x: pos.x, y: pos.y, z: (pos.z + 1) as FloorIndex });
      return;
    }

    // 5. LIGHT_SOURCE: toggle adjacent ceiling panel
    for (const { dx, dy } of [{ dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}]) {
      const lt = state.grid[pos.z]?.[pos.y + dy]?.[pos.x + dx];
      if (lt?.type === 'LIGHT_SOURCE') {
        worldEngine.toggleLight({ x: pos.x + dx, y: pos.y + dy, z: pos.z });
        return;
      }
    }

    // 6. ELEVATOR: open floor selection modal
    if (selfTile?.type === 'ELEVATOR') {
      eventBus.emit('ELEVATOR_OPEN_REQUESTED', {});
      return;
    }

    // 7. Door interaction (4-cardinal adjacents)
    for (const { dx, dy } of [{ dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}]) {
      const dt = state.grid[pos.z]?.[pos.y + dy]?.[pos.x + dx];
      if (dt?.type !== 'DOOR') continue;
      const doorPos: Vec3 = { x: pos.x + dx, y: pos.y + dy, z: pos.z };
      if (dt.locked && !dt.doorOpen) {
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
          entity && entity.status === 'ACTIVE' &&
          entity.pos.z === pos.z && entity.pos.x === tx && entity.pos.y === ty
        ) {
          if (SILICATE_IDS.has(id)) worldEngine.logViolation('SILICATE_INTERACTION', pos);
          eventBus.emit('TERMINAL_OPEN_REQUESTED', { entityId: id });
          return;
        }
      }

      if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
        worldEngine.logTerminalAccess(pos.z);
        const defaultId = pos.z === 2 ? 'EIRA-7' : pos.z === 4 ? 'ALFAR-22' : 'EIRA-7';
        eventBus.emit('TERMINAL_OPEN_REQUESTED', { entityId: defaultId });
        return;
      }
    }
  },

  tryChangeFloor(dir: -1 | 1): void {
    const state = worldEngine.getState();
    const { pos } = state.playerState;
    if (state.grid[pos.z]?.[pos.y]?.[pos.x]?.type !== 'STAIRWELL') return;
    const newZ = pos.z + dir * 2;
    if (newZ < 0 || newZ > 10) return;
    worldEngine.move({ x: pos.x, y: pos.y, z: newZ as FloorIndex });
  },
};
