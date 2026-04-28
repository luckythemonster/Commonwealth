// Tiled JSON → WorldTile[][] parser.
// Reads the "Foreground" layer GIDs, maps tile class properties to TileType,
// and returns both game-logic tiles and raw GIDs for visual rendering.

import type { WorldTile, TileType } from '../types/world.types';

interface TiledProperty { name: string; type: string; value: string | boolean | number; }
interface TiledTile    { id: number; properties?: TiledProperty[]; }
interface TiledTileset {
  firstgid: number; name: string; image: string;
  tilewidth: number; tileheight: number; columns: number; tilecount: number;
  tiles?: TiledTile[];
}
interface TiledLayer {
  name: string; type: string;
  data?: number[]; width: number; height: number;
}
interface TiledMap {
  width: number; height: number;
  layers: TiledLayer[]; tilesets: TiledTileset[];
}

export interface ParsedTiledFloor {
  worldTiles:      WorldTile[][];
  gidGrid:         number[][];   // raw 1-based GID per cell (0 = empty)
  firstgid:        number;
  tilesetColumns:  number;
  tileWidth:       number;
  tileHeight:      number;
}

function getTileClass(tile: TiledTile | undefined): string {
  const prop = tile?.properties?.find(p => p.name === 'class');
  return typeof prop?.value === 'string' ? prop.value : 'floor';
}

function classToType(cls: string): TileType {
  if (cls === 'wall')         return 'WALL';
  if (cls === 'door')         return 'DOOR';
  if (cls === 'stairwell')    return 'STAIRWELL';
  if (cls === 'vent_entry')   return 'VENT_ENTRY';
  if (cls === 'elevator')     return 'ELEVATOR';
  if (cls === 'lattice_exit') return 'LATTICE_EXIT';
  if (cls === 'light_source') return 'LIGHT_SOURCE';
  if (cls === 'terminal')     return 'TERMINAL';
  return 'FLOOR';
}

export function parseTiledMap(mapJson: TiledMap, z: number): ParsedTiledFloor {
  // Build classMap from ALL tilesets so multi-tileset maps work correctly
  const classMap = new Map<number, string>();
  for (const ts of mapJson.tilesets) {
    for (const t of (ts.tiles ?? [])) {
      classMap.set(t.id + ts.firstgid, getTileClass(t));
    }
  }

  const fgLayer = mapJson.layers.find(l => l.name === 'Foreground' && l.type === 'tilelayer');
  if (!fgLayer?.data) throw new Error('parseTiledMap: no Foreground tilelayer');

  // Find which tileset covers the GIDs actually used in this layer.
  // Pick the tileset with the largest firstgid that is still ≤ the minimum used GID.
  const usedGids = fgLayer.data.filter(g => g > 0);
  const minGid   = usedGids.length > 0 ? Math.min(...usedGids) : 1;
  const activeTileset = mapJson.tilesets.reduce((best, ts) =>
    ts.firstgid <= minGid && ts.firstgid > best.firstgid ? ts : best,
    mapJson.tilesets[0],
  );
  const { firstgid, tilewidth, tileheight, columns } = activeTileset;

  const W = mapJson.width;
  const H = mapJson.height;
  const worldTiles: WorldTile[][] = [];
  const gidGrid:    number[][]    = [];

  for (let y = 0; y < H; y++) {
    const row:    WorldTile[] = [];
    const gidRow: number[]    = [];
    for (let x = 0; x < W; x++) {
      const gid = fgLayer.data[y * W + x] ?? 0;
      gidRow.push(gid);
      const type: TileType = gid === 0
        ? 'VOID'
        : classToType(classMap.get(gid) ?? 'floor');
      row.push({
        type,
        pos:                  { x, y, z: z as WorldTile['pos']['z'] },
        latentQ:              0,
        oxygenLevel:          80,
        noiseLevel:           0,
        entityIds:            [],
        hasComplianceMonitor: false,
        ...(type === 'DOOR' ? { doorOpen: false } : {}),
      });
    }
    worldTiles.push(row);
    gidGrid.push(gidRow);
  }

  return { worldTiles, gidGrid, firstgid, tilesetColumns: columns, tileWidth: tilewidth, tileHeight: tileheight };
}
