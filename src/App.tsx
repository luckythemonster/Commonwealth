import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { worldEngine } from './engine/WorldEngine';
import { eventBus } from './engine/EventBus';
import { GameScene } from './phaser/GameScene';
import { InterrogationTerminal } from './components/InterrogationTerminal';
import { VentilationReport } from './components/VentilationReport';
import { useInput } from './hooks/useInput';
import type { SubjectivityBelief, FloorIndex, WorldState } from './types/world.types';

const CANVAS_W = 640;
const CANVAS_H = 448;

const sideBtn: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  background: 'transparent', border: '1px solid #223',
  color: '#556', fontFamily: 'monospace', fontSize: '10px',
  padding: '3px 6px', marginBottom: '3px', cursor: 'pointer',
};

const FLOOR_LABELS: Record<number, string> = {
  0: '[ADMIN/MIRADOR]', 2: '[INTAKE]', 4: '[RING C]',
  6: '[RESIDENTIAL]',   8: '[ARCHIVE]', 10: '[OPERATIONS]',
};

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef  = useRef<GameScene | null>(null);

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

  const refreshFloor = useCallback((z: FloorIndex, scene?: GameScene) => {
    const s = scene ?? sceneRef.current;
    if (!s) return;
    const state = worldEngine.getState();
    s.loadFloorData(state.grid[z], z);
    const entityData = [...state.entities.values()]
      .filter(e => e.pos.z === z)
      .map(e => ({ x: e.pos.x, y: e.pos.y, id: e.id, isGhost: e.isGhost, isEnforcer: e.id.startsWith('ENFORCER'), isPlayer: false }));
    if (state.playerState.pos.z === z)
      entityData.push({ x: state.playerState.pos.x, y: state.playerState.pos.y, id: 'PLAYER', isGhost: false, isEnforcer: false, isPlayer: true });
    s.renderEntityData(entityData);
  }, []);

  useEffect(() => {
    worldEngine.initWorld();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: CANVAS_W, height: CANVAS_H,
      parent: canvasRef.current ?? undefined,
      backgroundColor: '#050809',
      scene: [GameScene],
    });
    game.events.once('ready', () => {
      const scene = game.scene.getScene('GameScene') as GameScene;
      sceneRef.current = scene;
      refreshFloor(4, scene);
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
      eventBus.on('PLAYER_MOVED',                 ({ to }) => { setFloor(to.z as FloorIndex); refreshFloor(to.z as FloorIndex); }),
      eventBus.on('TURN_END',                     () => refreshFloor(floor)),
    ];
    return () => u.forEach(fn => fn());
  }, [floor, refreshFloor]);

  function handleEndTurn() {
    worldEngine.endTurn();
    const s = worldEngine.getState();
    setAp(s.playerState.ap); setStitcher(s.stitcherTurnsRemaining); setResonance(s.substrateResonance);
    refreshFloor(floor);
  }

  const resonanceColor = resonance > 75 ? '#a44' : resonance > 50 ? '#a84' : '#4a6';

  useInput({
    onRefresh: refreshFloor,
    onOpenTerminal: setTerminal,
    onEndTurn: handleEndTurn,
  });

  return (
    <div style={{ background: '#030507', minHeight: '100vh' }}>
      {/* HUD */}
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
        <span style={{ color: '#334' }}>BELIEF:{belief}</span>
        <span style={{ marginLeft: 'auto', cursor: 'pointer', color: '#445' }} onClick={() => { setWorldState({ ...worldEngine.getState() } as WorldState); setShowReport(true); }}>[REPORT]</span>
      </div>

      <div style={{ display: 'flex', paddingTop: '32px' }}>
        <div ref={canvasRef} style={{ width: CANVAS_W, height: CANVAS_H, flexShrink: 0, overflow: 'hidden' }} />

        {/* Sidebar */}
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
      </div>

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
    </div>
  );
}
