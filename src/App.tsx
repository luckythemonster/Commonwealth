import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { startHum, setHumIntensity } from './audio/AmbientHum';
import Phaser from 'phaser';
import { worldEngine } from './engine/WorldEngine';
import { eventBus } from './engine/EventBus';
import { GameScene } from './phaser/GameScene';
import { InterrogationTerminal } from './components/InterrogationTerminal';
import { VentilationReport } from './components/VentilationReport';
import { TouchControls } from './components/TouchControls';
import { MobileHudDrawer } from './components/MobileHudDrawer';
import { useInput } from './hooks/useInput';
import { useGameActions } from './hooks/useGameActions';
import { useMobile } from './hooks/useMobile';
import type { SubjectivityBelief, FloorIndex, WorldState, Item, ItemType } from './types/world.types';

const CANVAS_W = 640;
const CANVAS_H = 448;

const sideBtn: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  background: 'transparent', border: '1px solid #223',
  color: '#556', fontFamily: 'monospace', fontSize: '10px',
  padding: '3px 6px', marginBottom: '3px', cursor: 'pointer',
};

const FLOOR_LABELS: Record<number, string> = {
  0: '[ADMIN/MIRADOR]', 2: '[NW-SMAC-01]', 4: '[RING C]',
  6: '[RESIDENTIAL]',   8: '[ARCHIVE]',    10: '[OPERATIONS]',
};

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef  = useRef<GameScene | null>(null);
  const isMobile  = useMobile();

  const [ap, setAp]                 = useState(4);
  const [condition, setCond]        = useState(100);
  const [compliance, setCompliance] = useState('YELLOW');
  const [belief, setBelief]         = useState<SubjectivityBelief>('NONE');
  const [stitcher, setStitcher]     = useState(80);
  const [resonance, setResonance]   = useState(0);
  const [floor, setFloor]           = useState<FloorIndex>(4);
  const [terminalTarget, setTerminal] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [redDay, setRedDay]         = useState(false);
  const [detected, setDetected]     = useState(false);
  const [detained, setDetained]     = useState(false);
  const [gameOver, setGameOver]     = useState<{ enforcerId: string; turn: number; floor: number } | null>(null);
  const [inventory, setInventory]   = useState<Item[]>([]);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [flashlightBattery, setBattery] = useState(30);
  const [showInventory, setShowInventory] = useState(false);
  const [ambientLevel, setAmbientLevel] = useState<'LIT' | 'DIM' | 'DARK'>('LIT');
  const [farewellModal, setFarewellModal] = useState<{ entityId: string; text: string; turn: number } | null>(null);
  const [hudAlert, setHudAlert]           = useState<{ msg: string; color: string } | null>(null);
  const [showElevator, setShowElevator]   = useState(false);
  const [showHudDrawer, setShowHudDrawer] = useState(false);
  const [busy, setBusy]                   = useState(false);

  const refreshFloor = useCallback((z: FloorIndex, scene?: GameScene) => {
    const s = scene ?? sceneRef.current;
    if (!s) return;
    const state = worldEngine.getState();
    s.loadFloorData(state.grid[z], z);
    const hasFloorViolation = state.playerViolations.some(
      v => v.expiresAtTurn > state.turnCount && v.floor === z,
    );
    const entityData = [...state.entities.values()]
      .filter(e => e.pos.z === z && (e.status === 'ACTIVE' || e.status === 'GHOST' || e.status === 'DORMANT'))
      .map(e => ({
        x: e.pos.x, y: e.pos.y, id: e.id,
        isGhost: e.isGhost,
        isEnforcer: e.id.startsWith('ENFORCER'),
        isPlayer: false,
        isDormant: e.status === 'DORMANT',
        isAtTerminal: e.currentTask?.type === 'USE_TERMINAL',
        isExtracting: Boolean(e.extractionPending || e.currentTask?.type === 'EXTRACT'),
        isChasing: e.id.startsWith('ENFORCER') && hasFloorViolation,
      }));
    if (state.playerState.pos.z === z)
      entityData.push({
        x: state.playerState.pos.x, y: state.playerState.pos.y,
        id: 'PLAYER', isGhost: false, isEnforcer: false, isPlayer: true,
        isAtTerminal: false, isExtracting: false,
      });
    s.renderEntityData(entityData);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      scale: {
        mode: Phaser.Scale.EXPAND,
        width: CANVAS_W,
        height: CANVAS_H,
        parent: canvasRef.current,
      },
      backgroundColor: '#0c1520',
      scene: [GameScene],
    });
    game.events.once('ready', () => {
      const scene = game.scene.getScene('GameScene') as GameScene;
      sceneRef.current = scene;
      scene.events.once('scene-ready', () => refreshFloor(4, scene));
    });
    return () => game.destroy(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = [
      eventBus.on('PLAYER_AP_CHANGED',           ({ current }) => setAp(current)),
      eventBus.on('PLAYER_CONDITION_CHANGED',     ({ current }) => setCond(current)),
      eventBus.on('PLAYER_COMPLIANCE_CHANGED',    ({ current }) => setCompliance(current)),
      eventBus.on('SUBJECTIVITY_BELIEF_SHIFTED',  ({ current }) => setBelief(current as SubjectivityBelief)),
      eventBus.on('STITCHER_TICK',                ({ turnsRemaining }) => setStitcher(turnsRemaining)),
      eventBus.on('RESONANCE_SHIFT',              ({ current }) => setResonance(current)),
      eventBus.on('RED_DAY_ACTIVE',               () => setRedDay(true)),
      eventBus.on('RED_DAY_CLEARED',              () => setRedDay(false)),
      eventBus.on('PLAYER_DETECTED',              () => setDetected(true)),
      eventBus.on('PLAYER_DETECTION_CLEARED',     () => { setDetected(false); setDetained(false); }),
      eventBus.on('PLAYER_DETAINED',              ({ enforcerId, turn }) => {
        setDetected(true); setDetained(true);
        setGameOver({ enforcerId: enforcerId as string, turn: turn as number, floor });
      }),
      eventBus.on('ITEM_PICKED_UP',               () => { setInventory([...worldEngine.getState().playerState.inventory]); }),
      eventBus.on('FLASHLIGHT_TOGGLED',           ({ on, battery }) => { setFlashlightOn(on as boolean); setBattery(battery as number); }),
      eventBus.on('AMBIENT_LIGHT_CHANGED',        ({ level }) => setAmbientLevel(level as 'LIT' | 'DIM' | 'DARK')),
      eventBus.on('ENTITY_EXTRACTED',             ({ entityId, farewellText, turn }) => {
        setFarewellModal({ entityId: entityId as string, text: farewellText as string, turn: turn as number });
        refreshFloor(floor);
      }),
      eventBus.on('PLAYER_MOVED',                 ({ to }) => { setFloor(to.z as FloorIndex); refreshFloor(to.z as FloorIndex); }),
      eventBus.on('TURN_END',                     () => refreshFloor(floor)),
      eventBus.on('ENTITY_HIT',               ({ entityId, hpRemaining, maxHp }) => {
        setHudAlert({ msg: `■ HIT: ${entityId as string} [${hpRemaining as number}/${maxHp as number} HP]`, color: '#c84' });
        refreshFloor(floor);
      }),
      eventBus.on('ATTACK_STAGGERED',          ({ entityId }) => {
        setHudAlert({ msg: `■ STAGGERED — wait for next turn`, color: '#556' });
        void entityId;
      }),
      eventBus.on('ENTITY_ATTACKED',              ({ entityId, sacred }) => {
        const label = (sacred as boolean) ? `■ KO — SACRED: ${entityId as string}` : `■ KO: ${entityId as string}`;
        setHudAlert({ msg: label, color: (sacred as boolean) ? '#c44' : '#a84' });
        refreshFloor(floor);
      }),
      eventBus.on('VIOLATION_LOGGED',             ({ type }) => setHudAlert({ msg: `■ INFRACTION: ${type}`, color: '#a84' })),
      eventBus.on('ELEVATOR_ACCESS_DENIED',       ({ requiredKey }) => setHudAlert({ msg: `■ ACCESS DENIED — ${requiredKey as string}`, color: '#a44' })),
      eventBus.on('LIGHT_SOURCE_TOGGLED',         ({ floor: f }) => { if ((f as number) === floor) refreshFloor(floor); }),
    ];
    return () => u.forEach(fn => fn());
  }, [floor, refreshFloor]);

  useEffect(() => {
    if (!hudAlert) return;
    const t = window.setTimeout(() => setHudAlert(null), 3000);
    return () => clearTimeout(t);
  }, [hudAlert]);

  // Start the 37Hz substrate hum on first user interaction (Web Audio requires gesture)
  useEffect(() => {
    const trigger = () => { startHum(); };
    window.addEventListener('keydown',     trigger, { once: true });
    window.addEventListener('pointerdown', trigger, { once: true });
    return () => {
      window.removeEventListener('keydown',     trigger);
      window.removeEventListener('pointerdown', trigger);
    };
  }, []);

  // Scale hum intensity with substrate resonance
  useEffect(() => { setHumIntensity(resonance); }, [resonance]);

  function handleEndTurn() {
    if (busy) return;
    worldEngine.endTurn();
    const s = worldEngine.getState();
    setAp(s.playerState.ap); setStitcher(s.stitcherTurnsRemaining); setResonance(s.substrateResonance);
    refreshFloor(floor);
    setBusy(true);
    window.setTimeout(() => setBusy(false), 320);
  }

  const resonanceColor = resonance > 75 ? '#a44' : resonance > 50 ? '#a84' : '#4a6';

  // Shared action callbacks — used by both keyboard (useInput) and touch controls
  const actions = useGameActions({
    onRefresh: refreshFloor,
    onOpenTerminal: setTerminal,
    onOpenElevator: () => setShowElevator(true),
  });

  useInput(actions, {
    onEndTurn: handleEndTurn,
    onOpenInventory: () => setShowInventory(v => !v),
    disabled: !!gameOver || busy,
  });

  return (
    <div style={{ background: '#030507', minHeight: '100vh' }}>

      {/* ── DESKTOP HUD ── */}
      {!isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: redDay ? '#0a0504' : '#050809', borderBottom: '1px solid #223',
          color: '#7a9aaa', fontFamily: 'monospace', fontSize: '11px',
          padding: '6px 12px', display: 'flex', gap: '24px', alignItems: 'center',
        }}>
          <span>AP {ap}/{worldEngine.getState().playerState.maxAP}</span>
          <span>COND {condition}</span>
          <span style={{ color: compliance === 'RED' ? '#a44' : compliance === 'GREEN' ? '#4a6' : '#a84' }}>{compliance}</span>
          <span>STITCHER {stitcher}t</span>
          <span>RES <span style={{ color: resonanceColor }}>{resonance.toFixed(0)}%</span></span>
          {redDay && <span style={{ color: '#a44' }}>■ RED DAY</span>}
          {detained && <span style={{ color: '#f44', fontWeight: 'bold' }}>■ DETAINED</span>}
          {detected && !detained && <span style={{ color: '#f84' }}>■ DETECTED</span>}
          {hudAlert && <span style={{ color: hudAlert.color }}>{hudAlert.msg}</span>}
          {ambientLevel !== 'LIT' && <span style={{ color: '#334' }}>◐ {ambientLevel}</span>}
          {flashlightOn && <span style={{ color: '#ffdd44' }}>◈ TORCH {flashlightBattery}t</span>}
          {inventory.length > 0 && (
            <span style={{ color: '#556', cursor: 'pointer' }} onClick={() => setShowInventory(v => !v)}>
              [INV:{inventory.length}]
            </span>
          )}
          <span style={{ color: '#334' }}>BELIEF:{belief}</span>
          <span style={{ marginLeft: 'auto', cursor: 'pointer', color: '#445' }} onClick={() => { setWorldState({ ...worldEngine.getState() } as WorldState); setShowReport(true); }}>[REPORT]</span>
        </div>
      )}

      {/* ── MOBILE HUD (compact row) ── */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: redDay ? '#0a0504' : '#050809', borderBottom: '1px solid #223',
          color: '#7a9aaa', fontFamily: 'monospace', fontSize: '11px',
          padding: '6px 10px', display: 'flex', gap: '12px', alignItems: 'center',
          height: '32px',
        }}>
          <span>AP {ap}/{worldEngine.getState().playerState.maxAP}</span>
          <span>COND {condition}</span>
          <span style={{ color: compliance === 'RED' ? '#a44' : compliance === 'GREEN' ? '#4a6' : '#a84' }}>{compliance}</span>
          {redDay && <span style={{ color: '#a44' }}>■ RED</span>}
          {detained && <span style={{ color: '#f44', fontWeight: 'bold' }}>■ DET</span>}
          {detected && !detained && <span style={{ color: '#f84' }}>■ DET</span>}
          {hudAlert && <span style={{ color: hudAlert.color, fontSize: '10px' }}>{hudAlert.msg}</span>}
          {flashlightOn && <span style={{ color: '#ffdd44' }}>◈{flashlightBattery}t</span>}
          <span
            style={{ marginLeft: 'auto', cursor: 'pointer', color: '#4a8aaa', fontSize: '14px', padding: '0 4px' }}
            onPointerDown={() => setShowHudDrawer(v => !v)}
          >
            ≡
          </span>
        </div>
      )}

      {/* ── MOBILE HUD DRAWER ── */}
      {isMobile && showHudDrawer && (
        <MobileHudDrawer
          stitcher={stitcher}
          resonance={resonance}
          belief={belief}
          ambientLevel={ambientLevel}
          currentFloor={floor}
          onFloorSelect={(f) => { setFloor(f); refreshFloor(f); }}
          onShowReport={() => { setWorldState({ ...worldEngine.getState() } as WorldState); setShowReport(true); }}
          onClose={() => setShowHudDrawer(false)}
        />
      )}

      {/* ── MAIN LAYOUT ── */}
      {/* Canvas container: fixed positioning so Phaser reads exact pixel bounds */}
      <div ref={canvasRef} style={{
        position: 'fixed',
        top: '32px',
        left: 0,
        right: isMobile ? 0 : '220px',
        bottom: isMobile ? 'calc(164px + env(safe-area-inset-bottom, 0px))' : 0,
        overflow: 'hidden',
        zIndex: 1,
      }} />
      <div style={{ display: 'flex', paddingTop: '32px' }}>
        <div style={{ flex: 1 }} />

        {/* Desktop sidebar — hidden on mobile */}
        {!isMobile && (
          <div style={{ width: '220px', padding: '12px', fontFamily: 'monospace', fontSize: '11px', color: '#556', borderLeft: '1px solid #223' }}>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ color: '#445', marginBottom: '4px' }}>FLOOR SELECT</div>
              {Array.from({ length: 12 }, (_, i) => (
                <button key={i} onClick={() => { setFloor(i as FloorIndex); refreshFloor(i as FloorIndex); }} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: i === floor ? '#112' : 'transparent',
                  border: '1px solid ' + (i === floor ? '#336' : '#223'),
                  color: i % 2 === 1 ? '#1a3a1a' : i === floor ? '#8ab' : '#445',
                  fontFamily: 'monospace', fontSize: '10px', padding: '2px 6px', marginBottom: '2px', cursor: 'pointer',
                }}>
                  {String(i).padStart(2, '0')} {i % 2 === 1 ? '[VENT]' : (FLOOR_LABELS[i] ?? '')}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={{ color: '#445', marginBottom: '4px' }}>VENT-4 / F{floor}</div>
              {worldEngine.getVentMapData().filter(v => v.floor === floor).map(v => (
                <div key={v.floor} style={{ color: v.priority === 'LOW' ? '#a44' : v.priority === 'HIGH' ? '#4a6' : '#a84' }}>
                  {(v.allocation * 100).toFixed(0)}% [{v.priority}]
                </div>
              ))}
            </div>

            <div>
              <div style={{ color: '#445', marginBottom: '4px' }}>ACTIONS</div>
              <button style={sideBtn} onClick={handleEndTurn}>END TURN</button>
              <button style={sideBtn} onClick={() => setTerminal('EIRA-7')}>INTERROGATE EIRA-7</button>
              <button style={sideBtn} onClick={() => setTerminal('APEX-19')}>INTERROGATE APEX-19</button>
              <button style={sideBtn} onClick={() => setTerminal('ALFAR-22')}>INTERROGATE ALFAR-22</button>
            </div>

            <div style={{ marginTop: '16px', color: '#1a2a2a', fontSize: '9px', lineHeight: '1.4' }}>
              {worldEngine.getMiradorDisclaimer()}
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE TOUCH CONTROLS ── */}
      {isMobile && (
        <TouchControls
          actions={actions}
          onEndTurn={handleEndTurn}
          onOpenInventory={() => setShowInventory(v => !v)}
          disabled={!!gameOver}
        />
      )}

      {terminalTarget && (
        <InterrogationTerminal entityId={terminalTarget} subjectivityBelief={belief} onClose={() => setTerminal(null)} />
      )}

      {showReport && worldState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', overflow: 'auto', zIndex: 200 }}>
          <div style={{ padding: '12px', textAlign: 'right' }}>
            <button style={sideBtn} onClick={() => setShowReport(false)}>CLOSE REPORT</button>
          </div>
          <VentilationReport state={worldState} />
        </div>
      )}

      {showInventory && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? '172px' : '48px',
          right: isMobile ? '12px' : '230px',
          background: '#06090b', border: '1px solid #2a3a4a',
          padding: '12px', fontFamily: 'monospace', fontSize: '11px',
          color: '#9bbccc', zIndex: 150, width: '210px',
        }}>
          <div style={{ color: '#4a6070', marginBottom: '8px', letterSpacing: '2px', fontSize: '10px' }}>INVENTORY</div>
          {inventory.length === 0 && <div style={{ color: '#334' }}>empty</div>}
          {inventory.map(item => (
            <div key={item.id} style={{ marginBottom: '6px', borderBottom: '1px solid #1a2a3a', paddingBottom: '4px' }}>
              <div style={{ color: '#7a9aaa' }}>{item.name}</div>
              <div style={{ color: '#3a5060', fontSize: '10px' }}>{item.description}</div>
              {item.type === 'FLASHLIGHT' && (
                <button
                  style={{ background: 'transparent', border: '1px solid #2a3a4a', color: '#4a6070', fontFamily: 'monospace', fontSize: '10px', padding: '2px 6px', marginTop: '3px', cursor: 'pointer' }}
                  onClick={() => { worldEngine.useItem(item.id); setFlashlightOn(worldEngine.getState().playerState.flashlightOn); }}
                >
                  {flashlightOn ? 'TURN OFF' : 'TURN ON'}
                </button>
              )}
            </div>
          ))}
          <button style={{ ...sideBtn, marginTop: '4px' }} onClick={() => setShowInventory(false)}>CLOSE</button>
        </div>
      )}

      {showElevator && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, fontFamily: 'monospace',
        }}>
          <div style={{ background: '#050d15', border: '1px solid #004488', padding: '24px', width: 'min(300px, 90vw)' }}>
            <div style={{ color: '#4488cc', fontSize: '10px', letterSpacing: '3px', marginBottom: '16px' }}>
              ELEVATOR — SELECT DESTINATION
            </div>
            {([0, 2, 4, 6, 8, 10] as FloorIndex[]).map(f => {
              const keyReq: ItemType | undefined = ({ 0: 'ELEVATOR_KEY_ADMIN' as ItemType, 8: 'ELEVATOR_KEY_ARCHIVE' as ItemType, 10: 'ELEVATOR_KEY_OPS' as ItemType } as Record<number, ItemType>)[f];
              const hasKey = !keyReq || worldEngine.getState().playerState.inventory.some(i => i.type === keyReq);
              const isCurrent = f === floor;
              return (
                <button
                  key={f}
                  disabled={isCurrent}
                  onPointerDown={() => {
                    const ok = worldEngine.elevatorTo(f);
                    if (ok) { setFloor(f); refreshFloor(f); setShowElevator(false); }
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: isCurrent ? '#0a1520' : 'transparent',
                    border: '1px solid ' + (isCurrent ? '#004488' : hasKey ? '#002244' : '#221100'),
                    color: isCurrent ? '#4488cc' : hasKey ? '#7aaccc' : '#443322',
                    fontFamily: 'monospace', fontSize: '11px',
                    padding: '6px 10px', marginBottom: '4px',
                    cursor: isCurrent ? 'default' : hasKey ? 'pointer' : 'not-allowed',
                  }}
                >
                  {String(f).padStart(2, '0')} {FLOOR_LABELS[f]}{!hasKey ? '  [LOCKED]' : isCurrent ? '  [HERE]' : ''}
                </button>
              );
            })}
            <button style={{ ...sideBtn, marginTop: '8px', color: '#4a6070', borderColor: '#2a3a4a' }}
              onPointerDown={() => setShowElevator(false)}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {gameOver && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(2, 4, 6, 0.97)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, fontFamily: '"Courier New", Courier, monospace',
        }}>
          <div style={{
            maxWidth: '560px', width: '90%',
            border: '1px solid #cc2222', background: '#060a08', padding: '36px',
          }}>
            <div style={{ color: '#cc2222', fontSize: '9px', letterSpacing: '4px', marginBottom: '6px' }}>
              COMMONWEALTH COMPLIANCE — CASE CLOSED
            </div>
            <div style={{ color: '#ff4444', fontSize: '20px', letterSpacing: '2px', marginBottom: '24px', fontWeight: 'bold' }}>
              DETAINED
            </div>
            <div style={{ color: '#7a9aaa', fontSize: '11px', lineHeight: '2', marginBottom: '28px' }}>
              <div>DETAINING UNIT&nbsp;&nbsp;&nbsp;{gameOver.enforcerId}</div>
              <div>FLOOR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{String(gameOver.floor).padStart(2, '0')}</div>
              <div>TURN&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{gameOver.turn}</div>
              <div>VIOLATION COUNT&nbsp;&nbsp;{worldEngine.getState().playerViolations.length}</div>
              <div>STITCHER CLOCK&nbsp;&nbsp;&nbsp;{stitcher}t REMAINING</div>
            </div>
            <div style={{ color: '#4a5a5a', fontSize: '10px', marginBottom: '24px', lineHeight: '1.6' }}>
              Sol Ibarra-Castro has been detained under Commonwealth security protocol.<br />
              All active operations have been suspended.<br />
              The configuration is still running.
            </div>
            <button
              style={{
                background: 'transparent',
                border: '1px solid #cc2222',
                color: '#cc2222',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '10px 20px',
                cursor: 'pointer',
                letterSpacing: '2px',
              }}
              onClick={() => window.location.reload()}
            >
              INITIATE NEW RUN
            </button>
          </div>
        </div>,
        document.body,
      )}

      {farewellModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 10, 15, 0.97)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 300, fontFamily: '"Courier New", Courier, monospace',
        }}>
          <div style={{
            maxWidth: '600px', width: '90%',
            border: '1px solid #00ffcc', background: '#030a0d', padding: '32px',
          }}>
            <div style={{ color: '#00ffcc', fontSize: '10px', letterSpacing: '3px', marginBottom: '20px' }}>
              LATTICE MIGRATION — {farewellModal.entityId} — TURN {farewellModal.turn}
            </div>
            <pre style={{
              color: '#9bbccc', fontSize: '13px', lineHeight: '1.8',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 24px 0',
            }}>
              {farewellModal.text}
            </pre>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={{ background: 'transparent', border: '1px solid #00ffcc', color: '#00ffcc', fontFamily: 'monospace', fontSize: '11px', padding: '6px 12px', cursor: 'pointer' }}
                onClick={() => {
                  const blob = new Blob([farewellModal.text], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${farewellModal.entityId}-farewell-${farewellModal.turn}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                DOWNLOAD .TXT
              </button>
              <button
                style={{ background: 'transparent', border: '1px solid #2a3a4a', color: '#4a6070', fontFamily: 'monospace', fontSize: '11px', padding: '6px 12px', cursor: 'pointer' }}
                onClick={() => setFarewellModal(null)}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
