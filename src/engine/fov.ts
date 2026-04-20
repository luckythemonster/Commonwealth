// FOV — raycasting visibility for a 2D tile grid.
// 360 rays at 0.5° increments. WALL, VOID, and closed DOOR block light.
// Returns a Set of "x,y" keys for visible tiles.

import type { WorldTile } from '../types/world.types';

export const FOV_RADIUS = 7;
const RAY_COUNT = 720;

function blocksLight(tile: WorldTile): boolean {
  return tile.type === 'WALL' || tile.type === 'VOID'
    || (tile.type === 'DOOR' && tile.doorOpen !== true);
}

export function calculateFOV(
  tiles: WorldTile[][],
  ox: number,
  oy: number,
  radius = FOV_RADIUS,
): Set<string> {
  const height = tiles.length;
  const width  = tiles[0]?.length ?? 0;
  const visible = new Set<string>();
  visible.add(`${ox},${oy}`);

  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let x = ox + 0.5;
    let y = oy + 0.5;

    for (let step = 0; step < radius * 2; step++) {
      x += dx * 0.5;
      y += dy * 0.5;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) break;
      if ((tx - ox) ** 2 + (ty - oy) ** 2 > radius * radius) break;
      visible.add(`${tx},${ty}`);
      const tile = tiles[ty]?.[tx];
      if (!tile || blocksLight(tile)) break;
    }
  }

  return visible;
}
