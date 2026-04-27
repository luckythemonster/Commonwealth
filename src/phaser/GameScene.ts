// PHASER 3 SLAVE RENDERER — GameScene V2
// Solid-color tile Graphics + sprite overlay (when atlases loaded), diegetic HUD.
// Owns NO game state. All data pushed in via loadFloorData / renderEntityData.
// STRICT DIRECTIVE: Do NOT refactor or remove the EventBus bridge.

import Phaser from 'phaser';
import { eventBus } from '../engine/EventBus';
import { CHAR_ANIMS } from '../data/char-anims';
import type { WorldTile, FloorIndex } from '../types/world.types';

const TILE_SIZE = 32;
const WORLD_W   = 20 * TILE_SIZE; // 640
const WORLD_H   = 14 * TILE_SIZE; // 448

const TILE_COLORS: Record<string, number> = {
  FLOOR:              0x3c4450,
  WALL:               0x141820,
  VENT_ENTRY:         0x2a5a2a,
  VENT_PASSAGE:       0x163a16,
  TERMINAL:           0x1a2858,
  BROADCAST_TERMINAL: 0x3a1060,
  STAIRWELL:          0x505020,
  FACILITY_CONTROL:   0x3a1a50,
  DOOR:               0x6a4010,
  LATTICE_EXIT:       0x005540,
  LIGHT_SOURCE:       0xaa8820,
  VENT_EXIT_DOWN:     0x6a2800,
  ELEVATOR:           0x002a5a,
  VOID:               0x080c10,
};

export interface EntityRenderData {
  id: string;
  x: number;
  y: number;
  isPlayer: boolean;
  isEnforcer: boolean;
  isGhost: boolean;
}

export class GameScene extends Phaser.Scene {
  // World layers (back to front)
  private tileGfx!:      Phaser.GameObjects.Graphics;
  private tileDecorGfx!: Phaser.GameObjects.Graphics;
  private fovGfx!:       Phaser.GameObjects.Graphics;
  private entityGfx!:    Phaser.GameObjects.Graphics;
  private overlayGfx!:   Phaser.GameObjects.Graphics;

  // Entity labels (Text objects, rebuilt each renderEntities call)
  private entityLabels: Phaser.GameObjects.Text[] = [];

  // Sprite-based entity rendering
  private entitySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private entityPrevPos: Map<string, { x: number; y: number }>  = new Map();
  private entityFacing:  Map<string, string>                     = new Map();

  // Camera follow target — invisible Zone the camera lerps toward
  private solTracker!: Phaser.GameObjects.Zone;

  // Diegetic HUD — all setScrollFactor(0)
  private hudFloor!:    Phaser.GameObjects.Text;
  private hudAP!:       Phaser.GameObjects.Text;
  private hudStitcher!: Phaser.GameObjects.Text;
  private hudCondGfx!:  Phaser.GameObjects.Graphics;
  private hudAlert!:    Phaser.GameObjects.Text;
  private complianceDot!: Phaser.GameObjects.Graphics;

  // State
  private currentFloor: FloorIndex = 4;
  private currentTiles: WorldTile[][] = [];
  private currentEntities: EntityRenderData[] = [];
  private visibleTiles    = new Set<string>();
  private exploredByFloor = new Map<number, Set<string>>();

  private apmActive     = false;
  private redDayActive  = false;
  private floorAwakened = false;
  private glitchFrame   = false;
  private ambientLight: 'LIT' | 'DIM' | 'DARK' = 'LIT';

  // HUD state mirrors
  private apCurrent    = 3;
  private apMax        = 5;
  private condCurrent  = 100;
  private condMax      = 100;
  private stitcherRemaining = 200;
  private complianceStatus  = 'YELLOW';
  private solTileX     = 2;
  private solTileY     = 2;

  private unsubs: Array<() => void> = [];

  constructor() { super({ key: 'GameScene' }); }

  preload(): void {
    // Attempt to load all character atlases. Missing files log a 404 and are skipped gracefully.
    // Place {key}.png + {key}.json in public/assets/sprite_pack/ to activate sprites.
    const ATLASES = [
      'sol', 'enforcer', 'eira7', 'alfar22', 'resident', 'administrator',
      'med0', 'logi9', 'mite3_a', 'mite3_b', 'mite3_c', 'mite3_d',
      'lucky', 'form8', 'form9', 'vent4terminal',
    ];
    for (const key of ATLASES) {
      this.load.atlas(key,
        `/assets/sprite_pack/${key}.png`,
        `/assets/sprite_pack/${key}.json`,
      );
    }
  }

  create(): void {
    // World layers
    this.tileGfx      = this.add.graphics().setDepth(0);
    this.tileDecorGfx = this.add.graphics().setDepth(1);
    this.fovGfx       = this.add.graphics().setDepth(8);
    this.entityGfx    = this.add.graphics().setDepth(10);
    this.overlayGfx   = this.add.graphics().setDepth(20);

    // Camera follow target
    this.solTracker = this.add.zone(
      this.solTileX * TILE_SIZE + TILE_SIZE / 2,
      this.solTileY * TILE_SIZE + TILE_SIZE / 2,
      1, 1,
    );

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.solTracker, true, 0.1, 0.1);
    cam.setZoom(1);

    // Diegetic HUD — setScrollFactor(0) keeps them viewport-fixed
    this.hudFloor = this.add.text(8, 4, 'F:02', {
      fontFamily: 'monospace', fontSize: '11px', color: '#4a7a9a',
    }).setScrollFactor(0).setDepth(200);

    this.hudAP = this.add.text(WORLD_W - 8, 4, '■■■□□', {
      fontFamily: 'monospace', fontSize: '11px', color: '#7aaa7a',
    }).setScrollFactor(0).setDepth(200).setOrigin(1, 0);

    this.hudStitcher = this.add.text(8, WORLD_H - 14, 'STITCHER: 200', {
      fontFamily: 'monospace', fontSize: '9px', color: '#4a5a5a',
    }).setScrollFactor(0).setDepth(200);

    this.hudCondGfx = this.add.graphics().setScrollFactor(0).setDepth(200);

    this.hudAlert = this.add.text(WORLD_W / 2, 18, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#cc4422',
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5, 0).setAlpha(0);

    // Compliance dot follows Sol in update() — NOT scroll-fixed
    this.complianceDot = this.add.graphics().setDepth(50);

    this.registerAnimations();
    this.subscribeToEventBus();
    this.renderHUD();
    this.events.emit('scene-ready');
  }

  update(): void {
    // Compliance dot tracks Sol's world position
    const px = this.solTileX * TILE_SIZE + TILE_SIZE / 2;
    const py = this.solTileY * TILE_SIZE - 6;
    const color = this.complianceStatus === 'GREEN'  ? 0x44cc44
                : this.complianceStatus === 'YELLOW' ? 0xccaa22
                : 0xcc2222;
    this.complianceDot.clear();
    this.complianceDot.fillStyle(color, 0.9);
    this.complianceDot.fillCircle(px, py, 3);
  }

  // ── PUBLIC INTERFACE ──────────────────────────────────────────────────────

  loadFloorData(tiles: WorldTile[][], floor: FloorIndex): void {
    this.currentTiles = tiles;
    this.currentFloor = floor;
    this.floorAwakened = false;
    this.hudFloor.setText(`F:${String(Math.floor(floor / 2)).padStart(2, '0')}`);
    this.renderAll();
  }

  renderEntityData(entities: EntityRenderData[]): void {
    this.currentEntities = entities;
    this.renderEntities();
  }

  // ── EVENTBUS ──────────────────────────────────────────────────────────────

  private subscribeToEventBus(): void {
    this.unsubs.push(
      eventBus.on('PLAYER_MOVED', ({ to }) => {
        this.solTileX = to.x;
        this.solTileY = to.y;
        this.solTracker.setPosition(
          to.x * TILE_SIZE + TILE_SIZE / 2,
          to.y * TILE_SIZE + TILE_SIZE / 2,
        );
        if (to.z !== this.currentFloor) {
          this.currentFloor = to.z as FloorIndex;
          this.floorAwakened = false;
          this.visibleTiles = new Set();
        }
        this.hudFloor.setText(`F:${String(Math.floor((to.z as number) / 2)).padStart(2, '0')}`);
      }),

      eventBus.on('FOV_UPDATED', ({ floor, visibleTiles }) => {
        if (floor !== this.currentFloor) return;
        this.visibleTiles = new Set(visibleTiles as string[]);
        let explored = this.exploredByFloor.get(floor as number);
        if (!explored) { explored = new Set(); this.exploredByFloor.set(floor as number, explored); }
        for (const key of visibleTiles as string[]) explored.add(key);
        this.renderTiles();
        this.renderFOV();
        this.renderEntities();
      }),

      eventBus.on('DOOR_TOGGLED', ({ pos, open }) => {
        const p = pos as { x: number; y: number; z: number };
        if (p.z !== this.currentFloor) return;
        const tile = this.currentTiles[p.y]?.[p.x];
        if (tile) tile.doorOpen = open as boolean;
        this.renderTiles();
      }),

      eventBus.on('ENTITY_MOVED',          () => this.renderEntities()),
      eventBus.on('ENTITY_STATUS_CHANGED', () => this.renderEntities()),
      eventBus.on('TURN_END',              () => { this.glitchFrame = false; this.renderAll(); }),

      eventBus.on('RED_DAY_ACTIVE',  () => { this.redDayActive = true;  this.renderOverlay(); }),
      eventBus.on('RED_DAY_CLEARED', () => { this.redDayActive = false; this.renderOverlay(); }),
      eventBus.on('APM_ACTIVE',      () => { this.apmActive = true;  this.renderOverlay(); }),
      eventBus.on('APM_DEACTIVATE',  () => { this.apmActive = false; this.renderOverlay(); }),

      eventBus.on('FLOOR_AWAKENED', ({ floor }) => {
        if (floor === this.currentFloor) { this.floorAwakened = true; this.renderTiles(); }
      }),

      eventBus.on('PERSONA_GLITCH', ({ floor }) => {
        if (floor !== this.currentFloor) return;
        this.glitchFrame = true;
        this.renderOverlay();
        this.time.delayedCall(16, () => { this.glitchFrame = false; this.renderOverlay(); });
      }),

      eventBus.on('RESONANCE_SHIFT', () => this.renderOverlay()),

      eventBus.on('ENV_SLIP', ({ pos }) => {
        if (pos.z === this.currentFloor) this.flashTile(pos.x, pos.y, 0xffffff, 0.15);
      }),

      eventBus.on('NOISE_EVENT', ({ origin, intensity }) => {
        if (origin.z === this.currentFloor) this.pulseNoise(origin.x, origin.y, intensity);
      }),

      eventBus.on('AMBIENT_LIGHT_CHANGED', ({ floor, level }) => {
        if ((floor as number) !== this.currentFloor) return;
        this.ambientLight = level as 'LIT' | 'DIM' | 'DARK';
        this.renderOverlay();
      }),

      eventBus.on('FLASHLIGHT_TOGGLED', () => this.renderOverlay()),

      eventBus.on('LIGHT_SOURCE_TOGGLED', ({ floor }) => {
        if ((floor as number) === this.currentFloor) { this.renderTiles(); this.renderOverlay(); }
      }),

      eventBus.on('EXTRACTION_TRIGGERED', () => this.renderTiles()),

      eventBus.on('VIOLATION_LOGGED', ({ type }) => {
        this.hudAlert.setText(`INFRACTION: ${type as string}`).setAlpha(1);
        this.tweens.add({
          targets: this.hudAlert, alpha: 0, duration: 2000, delay: 600, ease: 'Linear',
        });
        // Brief red vignette
        this.overlayGfx.fillStyle(0xaa0000, 0.28);
        this.overlayGfx.fillRect(0, 0, WORLD_W, WORLD_H);
        this.time.delayedCall(120, () => this.renderOverlay());
      }),

      eventBus.on('DOOR_LOCKED_BLOCKED', ({ pos }) => {
        const p = pos as { x: number; y: number; z: number };
        if (p.z === this.currentFloor) this.flashTile(p.x, p.y, 0xcc2222, 0.6);
      }),

      // HUD data updates
      eventBus.on('PLAYER_AP_CHANGED', ({ current }) => {
        this.apCurrent = current as number;
        this.renderHUD();
      }),

      eventBus.on('PLAYER_CONDITION_CHANGED', ({ current }) => {
        this.condCurrent = current as number;
        this.renderHUD();
      }),

      eventBus.on('STITCHER_TICK', ({ turnsRemaining }) => {
        this.stitcherRemaining = turnsRemaining as number;
        this.hudStitcher.setText(`STITCHER: ${String(turnsRemaining).padStart(3, '0')}`);
      }),

      eventBus.on('PLAYER_COMPLIANCE_CHANGED', ({ current }) => {
        this.complianceStatus = current as string;
      }),

      // Detention overlay — synchronous DOM, bypasses React 18 batching
      eventBus.on('PLAYER_DETAINED', ({ enforcerId, turn }) => {
        document.getElementById('__detained__')?.remove();
        const el = document.createElement('div');
        el.id = '__detained__';
        el.style.cssText = [
          'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.92)',
          'display:flex', 'flex-direction:column',
          'align-items:center', 'justify-content:center',
          'z-index:9999', 'font-family:monospace', 'color:#cc4422',
          'cursor:pointer',
        ].join(';');
        el.innerHTML = `
          <div style="font-size:28px;letter-spacing:4px;margin-bottom:16px">DETAINED</div>
          <div style="font-size:11px;color:#5a7a8a;margin-bottom:4px">ENFORCER: ${enforcerId as string}</div>
          <div style="font-size:11px;color:#3a5a6a;margin-bottom:24px">TURN: ${turn as number}</div>
          <div style="font-size:10px;color:#2a4a5a;border:1px solid #2a4a5a;padding:8px;text-align:center">
            SUBJECT DETAINED — PENDING PROCESSING<br>
            AWAIT COMPLIANCE OFFICER
          </div>
          <div style="margin-top:20px;font-size:9px;color:#1a2a3a">[click to dismiss]</div>
        `;
        el.addEventListener('click', () => el.remove());
        document.body.appendChild(el);
      }),
    );
  }

  // ── RENDER METHODS ────────────────────────────────────────────────────────

  private renderAll(): void {
    this.renderTiles();
    this.renderFOV();
    this.renderEntities();
    this.renderOverlay();
  }

  private renderTiles(): void {
    const tg = this.tileGfx;
    const g  = this.tileDecorGfx;
    tg.clear();
    g.clear();

    for (let y = 0; y < this.currentTiles.length; y++) {
      const row = this.currentTiles[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (!tile) continue;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Base solid-color fill
        const baseColor = TILE_COLORS[tile.type] ?? 0x080c10;
        tg.fillStyle(baseColor, 1.0);
        tg.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // DOOR: dynamic state rendering
        if (tile.type === 'DOOR') {
          if (tile.doorOpen) {
            g.fillStyle(0x3a2008, 0.55);
          } else {
            g.fillStyle(0x8b5a14, 0.9);
            g.lineStyle(2, 0xccaa44, 0.8);
            g.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          }
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          if (tile.locked && !tile.doorOpen) {
            const cx = px + TILE_SIZE / 2;
            const cy = py + TILE_SIZE / 2;
            g.fillStyle(0xcc2222, 0.85);
            g.fillTriangle(cx, cy - 4, cx + 4, cy, cx, cy + 4);
            g.fillTriangle(cx, cy - 4, cx - 4, cy, cx, cy + 4);
          }
        }

        // WALL: subtle inner stroke for depth
        if (tile.type === 'WALL') {
          g.lineStyle(1, 0x0a0e18, 0.5);
          g.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // Incident record tint
        if (tile.incidentRecord) {
          g.fillStyle(0x3a0000, 0.55);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // TERMINAL / BROADCAST_TERMINAL border
        if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
          g.lineStyle(1, 0x8888cc, 0.6);
          g.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        // STAIRWELL border
        if (tile.type === 'STAIRWELL') {
          g.lineStyle(1, 0xccbb44, 0.8);
          g.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        // LATTICE_EXIT pulsing teal border
        if (tile.type === 'LATTICE_EXIT') {
          const pulse = 0.4 + 0.4 * Math.sin(this.time.now / 400);
          g.lineStyle(2, 0x00ffcc, pulse);
          g.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        // LIGHT_SOURCE: warm glow when on, dark when off
        if (tile.type === 'LIGHT_SOURCE') {
          if (tile.lightSourceOn === false) {
            g.fillStyle(0x1a1a1a, 0.85);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          } else {
            g.lineStyle(2, 0xffeeaa, 0.8);
            g.strokeRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          }
        }

        // VENT_EXIT_DOWN: orange border + down arrow
        if (tile.type === 'VENT_EXIT_DOWN') {
          const cx = px + TILE_SIZE / 2;
          const cy = py + TILE_SIZE / 2;
          g.lineStyle(2, 0xcc6600, 0.85);
          g.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          g.lineBetween(cx, cy - 5, cx, cy + 5);
          g.lineBetween(cx - 3, cy + 2, cx, cy + 5);
          g.lineBetween(cx + 3, cy + 2, cx, cy + 5);
        }

        // ELEVATOR: blue border + up arrow
        if (tile.type === 'ELEVATOR') {
          const cx = px + TILE_SIZE / 2;
          const cy = py + TILE_SIZE / 2;
          g.lineStyle(2, 0x4488cc, 0.9);
          g.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          g.lineBetween(cx, cy + 5, cx, cy - 5);
          g.lineBetween(cx - 3, cy - 2, cx, cy - 5);
          g.lineBetween(cx + 3, cy - 2, cx, cy - 5);
        }

        // Item pickup indicator — gold diamond
        if (tile.itemId) {
          const cx = px + TILE_SIZE / 2;
          const cy = py + TILE_SIZE / 2;
          g.fillStyle(0xffdd44, 0.9);
          g.fillTriangle(cx, cy - 5, cx + 4, cy, cx - 4, cy);
          g.fillTriangle(cx, cy + 5, cx + 4, cy, cx - 4, cy);
        }

        // Low oxygen strip at tile bottom
        if (tile.oxygenLevel < 50) {
          const alpha = (1 - tile.oxygenLevel / 50) * 0.5;
          g.fillStyle(0x880000, alpha);
          g.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE - 1, 3);
        }
      }
    }

    if (this.floorAwakened) {
      g.fillStyle(0x001a10, 0.35);
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  private renderFOV(): void {
    const fov = this.fovGfx;
    fov.clear();
    if (this.visibleTiles.size === 0) return;

    const explored = this.exploredByFloor.get(this.currentFloor);
    for (let y = 0; y < this.currentTiles.length; y++) {
      const row = this.currentTiles[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const key = `${x},${y}`;
        const isVisible  = this.visibleTiles.has(key);
        const isExplored = explored?.has(key) ?? false;
        if (isVisible) continue;
        if (!isExplored) {
          fov.fillStyle(0x040810, 1.0);
        } else {
          fov.fillStyle(0x000000, 0.62);
        }
        fov.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private renderEntities(): void {
    const g = this.entityGfx;
    g.clear();
    for (const lbl of this.entityLabels) lbl.destroy();
    this.entityLabels = [];

    const useFOV   = this.visibleTiles.size > 0;
    const currentIds = new Set(this.currentEntities.map(e => e.id));

    // Destroy sprites for entities no longer on this floor
    for (const [id, sprite] of this.entitySprites) {
      if (!currentIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
        this.entityPrevPos.delete(id);
      }
    }

    for (const e of this.currentEntities) {
      // Compute moved BEFORE updating prevPos
      const prev  = this.entityPrevPos.get(e.id);
      const moved = prev ? (e.x !== prev.x || e.y !== prev.y) : false;

      if (moved && prev) {
        const dx = e.x - prev.x;
        const dy = e.y - prev.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          this.entityFacing.set(e.id, dx > 0 ? 'east' : 'west');
        } else {
          this.entityFacing.set(e.id, dy > 0 ? 'south' : 'north');
        }
      }
      this.entityPrevPos.set(e.id, { x: e.x, y: e.y });

      const tileKey = `${e.x},${e.y}`;
      const inFOV   = !useFOV || e.isPlayer || this.visibleTiles.has(tileKey);
      if (!inFOV && !e.isGhost) {
        // Dim any existing sprite; skip rectangle
        this.entitySprites.get(e.id)?.setAlpha(0.35);
        continue;
      }

      const alpha    = e.isGhost ? 0.25 : (inFOV ? 0.9 : 0.35);
      const atlasKey = this.getAtlasKeyForEntity(e.id);
      const useSprite = atlasKey !== '' && this.textures.exists(atlasKey) && !e.isGhost;

      if (useSprite) {
        this.updateEntitySprite(e, atlasKey, alpha, moved);
      } else {
        // Colored rectangle fallback — destroy stale sprite if present
        const stale = this.entitySprites.get(e.id);
        if (stale) { stale.destroy(); this.entitySprites.delete(e.id); }

        const px    = e.x * TILE_SIZE;
        const py    = e.y * TILE_SIZE;
        const color = e.isPlayer ? 0x00cc99 : e.isEnforcer ? 0xcc2222 : e.isGhost ? 0x445566 : 0x8a7744;
        g.fillStyle(color, alpha);
        g.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        g.lineStyle(1, color, Math.min(alpha + 0.1, 1));
        g.strokeRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);

        const lbl = this.add.text(px + TILE_SIZE / 2, py + TILE_SIZE / 2, e.id.slice(0, 7), {
          fontFamily: 'monospace', fontSize: '6px', color: '#ffffff',
        }).setOrigin(0.5).setAlpha(alpha * 0.9).setDepth(11);
        this.entityLabels.push(lbl);
      }
    }
  }

  private updateEntitySprite(
    e: EntityRenderData, atlasKey: string, alpha: number, moved: boolean,
  ): void {
    const px = e.x * TILE_SIZE + TILE_SIZE / 2;
    const py = e.y * TILE_SIZE + TILE_SIZE / 2;

    let sprite = this.entitySprites.get(e.id);
    if (!sprite) {
      sprite = this.add.sprite(px, py, atlasKey).setDepth(10).setOrigin(0.5, 0.5);
      this.entitySprites.set(e.id, sprite);
    } else {
      sprite.setPosition(px, py);
    }
    sprite.setAlpha(alpha).setVisible(true);

    const facing  = this.entityFacing.get(e.id) ?? 'south';
    const action  = moved ? 'walk' : 'idle';
    const animKey = `${this.animPrefixFromAtlasKey(atlasKey)}_${action}_${facing}`;

    if (this.anims.exists(animKey) && sprite.anims.currentAnim?.key !== animKey) {
      sprite.play(animKey, true);
    }
  }

  private getAtlasKeyForEntity(id: string): string {
    if (id === 'SOL')                          return 'sol';
    if (id.startsWith('ENFORCER'))             return 'enforcer';
    if (id === 'EIRA-7')                       return 'eira7';
    if (id === 'ALFAR-22')                     return 'alfar22';
    if (id.startsWith('RESIDENT'))             return 'resident';
    if (id.startsWith('ADM'))                  return 'administrator';
    if (id.startsWith('MED'))                  return 'med0';
    if (id.startsWith('LOGI'))                 return 'logi9';
    if (id.startsWith('MITE-3A') || id.startsWith('MITE3A')) return 'mite3_a';
    if (id.startsWith('MITE-3B') || id.startsWith('MITE3B')) return 'mite3_b';
    if (id.startsWith('MITE-3C') || id.startsWith('MITE3C')) return 'mite3_c';
    if (id.startsWith('MITE-3D') || id.startsWith('MITE3D')) return 'mite3_d';
    if (id === 'LUCKY')                        return 'lucky';
    if (id === 'FORM-8')                       return 'form8';
    if (id === 'FORM-9')                       return 'form9';
    if (id === 'VENT-4')                       return 'vent4terminal';
    return '';
  }

  private animPrefixFromAtlasKey(atlasKey: string): string {
    // mite3_a → mite3a; all others unchanged (no underscore in name)
    return atlasKey.replace('_', '');
  }

  private atlasKeyFromAnimKey(animKey: string): string {
    const prefix = animKey.split('_')[0];
    const REMAP: Record<string, string> = {
      mite3a: 'mite3_a', mite3b: 'mite3_b', mite3c: 'mite3_c', mite3d: 'mite3_d',
    };
    return REMAP[prefix] ?? prefix;
  }

  private registerAnimations(): void {
    for (const anim of CHAR_ANIMS) {
      if (anim.frames[0].startsWith('__')) continue;  // placeholder frames not ready
      const atlasKey = this.atlasKeyFromAnimKey(anim.key);
      if (!this.textures.exists(atlasKey)) continue;
      if (this.anims.exists(anim.key)) continue;
      this.anims.create({
        key:       anim.key,
        frames:    anim.frames.map(f => ({ key: atlasKey, frame: f })),
        frameRate: anim.frameRate,
        repeat:    anim.repeat,
      });
    }
  }

  private renderOverlay(): void {
    const g = this.overlayGfx;
    g.clear();

    if (this.apmActive) {
      g.fillStyle(0x001a2a, 0.25);
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (this.redDayActive) {
      g.fillStyle(0x1a0500, 0.2);
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (this.glitchFrame) {
      for (let y = 0; y < this.currentTiles.length; y++) {
        const row = this.currentTiles[y];
        if (!row) continue;
        for (let x = 0; x < row.length; x++) {
          if (row[x]?.type === 'BROADCAST_TERMINAL') {
            g.lineStyle(1, 0x00ffff, 0.9);
            g.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            g.lineStyle(1, 0x00ffff, 0.35);
            g.lineBetween(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2,
                          (x + 1) * TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2);
          }
        }
      }
    }
    if (this.ambientLight === 'DIM') {
      g.fillStyle(0x0a1020, 0.45);
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    } else if (this.ambientLight === 'DARK') {
      g.fillStyle(0x040810, 0.72);
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  private renderHUD(): void {
    const dots = '■'.repeat(Math.max(0, this.apCurrent)) + '□'.repeat(Math.max(0, this.apMax - this.apCurrent));
    this.hudAP.setText(`${dots} AP:${this.apCurrent}`);

    const cg   = this.hudCondGfx;
    cg.clear();
    const barW   = 60;
    const barH   = 6;
    const bx     = WORLD_W - barW - 8;
    const by     = WORLD_H - barH - 5;
    const filled = Math.round(barW * Math.max(0, this.condCurrent) / Math.max(1, this.condMax));
    cg.fillStyle(0x1a2a2a, 0.8);
    cg.fillRect(bx, by, barW, barH);
    const col = this.condCurrent > 60 ? 0x44aa44 : this.condCurrent > 30 ? 0xaaaa22 : 0xcc2222;
    cg.fillStyle(col, 0.9);
    cg.fillRect(bx, by, filled, barH);
    cg.lineStyle(1, 0x2a4a4a, 0.5);
    cg.strokeRect(bx, by, barW, barH);
  }

  // ── VISUAL EFFECTS ────────────────────────────────────────────────────────

  private flashTile(x: number, y: number, color = 0xffffff, alpha = 0.15): void {
    this.overlayGfx.fillStyle(color, alpha);
    this.overlayGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
    this.time.delayedCall(80, () => this.renderOverlay());
  }

  private pulseNoise(ox: number, oy: number, intensity: number): void {
    this.flashTile(ox, oy, 0xaa6600, 0.5);
    const maxR = Math.min(Math.floor(intensity / 2), 5);
    for (let r = 1; r <= maxR; r++) {
      const a = 0.35 * (1 - r / (maxR + 1));
      this.time.delayedCall(r * 40, () => {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const tile = this.currentTiles[oy + dy]?.[ox + dx];
            if (!tile || tile.type === 'WALL' || tile.type === 'VOID') continue;
            this.flashTile(ox + dx, oy + dy, 0xaa6600, a);
          }
        }
      });
    }
  }

  shutdown(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    for (const lbl of this.entityLabels) lbl.destroy();
    this.entityLabels = [];
    for (const sprite of this.entitySprites.values()) sprite.destroy();
    this.entitySprites.clear();
    this.entityPrevPos.clear();
    this.entityFacing.clear();
  }
}
