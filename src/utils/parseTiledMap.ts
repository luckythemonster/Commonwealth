// Tiled JSON → WorldTile[][] parser.
// Reads the "Foreground" layer GIDs, maps tile class properties to TileType,
// reads the "Objects" layer for per-tile instance data (items, door state, etc.),
// and returns both game-logic tiles and raw GIDs for visual rendering.

import type { WorldTile, TileType } from '../types/world.types';

interface TiledProperty { name: string; type: string; value: string | boolean | number; }
interface TiledTile    { id: number; properties?: TiledProperty[]; }
interface TiledTileset {
  firstgid: number; name: string; image: string;
  tilewidth: number; tileheight: number; columns: number; tilecount: number;
  tiles?: TiledTile[];
}
interface TiledObject {
  x: number; y: number;
  properties?: TiledProperty[];
}
interface TiledLayer {
  name: string; type: string;
  data?: number[];           // tilelayer
  objects?: TiledObject[];  // objectgroup
  width: number; height: number;
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

type ObjProps = Record<string, string | boolean | number>;

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
  const usedGids = fgLayer.data.filter(g => g > 0);
  const minGid   = usedGids.length > 0 ? Math.min(...usedGids) : 1;
  const activeTileset = mapJson.tilesets.reduce((best, ts) =>
    ts.firstgid <= minGid && ts.firstgid > best.firstgid ? ts : best,
    mapJson.tilesets[0],
  );
  const { firstgid, tilewidth, tileheight, columns } = activeTileset;

  // Build grid-cell → property map from the "Objects" layer (optional).
  const objProps = new Map<string, ObjProps>();
  const objLayer = mapJson.layers.find(l => l.name === 'Objects' && l.type === 'objectgroup');
  if (objLayer?.objects) {
    for (const obj of objLayer.objects) {
      const gx = Math.floor(obj.x / tilewidth);
      const gy = Math.floor(obj.y / tileheight);
      if (gx < 0 || gy < 0 || gx >= mapJson.width || gy >= mapJson.height) continue;
      const props: ObjProps = {};
      for (const p of (obj.properties ?? [])) props[p.name] = p.value as string | boolean | number;
      objProps.set(`${gx},${gy}`, props);
    }
  }

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

      const props = objProps.get(`${x},${y}`);
      row.push({
        type,
        pos:                  { x, y, z: z as WorldTile['pos']['z'] },
        latentQ:              0,
        oxygenLevel:          80,
        noiseLevel:           0,
        entityIds:            [],
        hasComplianceMonitor: false,
        // Door state from object props (defaults: closed, unlocked)
        ...(type === 'DOOR' ? {
          doorOpen: props?.door_open === true,
          locked:   props?.locked    === true,
        } : {}),
        // Light source: on by default unless explicitly turned off
        ...(type === 'LIGHT_SOURCE' ? {
          lightSourceOn: props?.light_off !== true,
        } : {}),
        // Per-tile instance data from Objects layer
        ...(props?.item        ? { itemId:      String(props.item) }        : {}),
        ...(props?.sensor_node ? { sensorNodeId: String(props.sensor_node) } : {}),
      });
    }
    worldTiles.push(row);
    gidGrid.push(gidRow);
  }

  return { worldTiles, gidGrid, firstgid, tilesetColumns: columns, tileWidth: tilewidth, tileHeight: tileheight };
}
