// RobotMonitor — live per-robot signal board with history charts + controls.
// Live tiles ride the `botStatus` feed App.jsx polls every 5s (/api/fake-data).
// Each card also pulls its own signal history (/robot-history) for the charts.
// A built-in Demo mode fabricates signals client-side so the UI can be previewed
// before any robot/backend is connected.
import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useRobotHistory, sendRobotCommand } from '../../hooks/useLiveData';
import { useToast } from '../common/Toast';

// One signal tile: label, big value, and a colour tone (ok | warn | bad | idle).
function Tile({ label, value, tone = 'idle', sub, pulse }) {
  const tones = {
    ok: 'bg-soft text-accent border-accent/30',
    warn: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10',
    bad: 'bg-danger-soft text-danger border-danger/30',
    idle: 'bg-sunk text-muted border-line',
  };
  return (
    <div className={`rounded-2xl border p-3 flex flex-col justify-between ${tones[tone]} ${pulse ? 'animate-pulse' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-lg font-black leading-tight mt-1">{value}</span>
      {sub != null && <span className="text-[10px] font-bold opacity-70 mt-0.5">{sub}</span>}
    </div>
  );
}

const DIR_ARROW = { FORWARD: '▲', REVERSE: '▼', STOP: '■' };

// ---------------------------------------------------------------------------
// Demo data generator — realistic robot signals, entirely client-side.
// ---------------------------------------------------------------------------
function nowLabel() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function genPoint(i, phase) {
  const raining = Math.random() < 0.05;
  const obstacle = !raining && Math.random() < 0.08;
  let pwm;
  if (raining || obstacle) {
    pwm = 0; // head stalls when it rains or hits something
  } else {
    pwm = Math.round(150 + 80 * Math.sin((i + phase) / 5) + (Math.random() * 24 - 12));
  }
  pwm = Math.max(0, Math.min(255, pwm));
  return {
    t: nowLabel(),
    pwm,
    rpm: Math.round((pwm / 255) * 60),
    obstacle: obstacle ? 1 : 0,
    rain: raining ? 1 : 0,
    alarm: raining || obstacle ? 1 : 0,
  };
}

function botFromSeries(cfg, series, dirForward) {
  const last = series[series.length - 1] || { pwm: 0, rpm: 0, obstacle: 0, rain: 0, alarm: 0 };
  const running = last.pwm > 0;
  return {
    farm_name: cfg.name,
    city: cfg.city,
    status: 'NORMAL',
    battery_percentage: cfg.batt,
    motor_speed: last.rpm,
    robot: {
      motor_direction: running ? (dirForward ? 'FORWARD' : 'REVERSE') : 'STOP',
      motor_pwm: last.pwm,
      power_state: 1,
      rain_status: last.rain,
      motor_status: last.alarm ? 'IDLE' : running ? 'RUNNING' : 'IDLE',
      obstacle_detected: last.obstacle,
      alarm_active: last.alarm,
    },
  };
}

const DEMO_UNITS = [
  { id: 'demo-1', name: 'Demo Bot · Rooftop A', city: 'Preview', batt: 82 },
  { id: 'demo-2', name: 'Demo Bot · Field B', city: 'Preview', batt: 64 },
];

// Returns { [id]: bot } with a rolling `__series`, ticking every 2s while enabled.
function useDemoData(enabled) {
  const [data, setData] = useState({});

  useEffect(() => {
    if (!enabled) return undefined;

    const state = {};
    DEMO_UNITS.forEach((cfg, ci) => {
      const series = [];
      for (let i = 0; i < 24; i += 1) series.push(genPoint(i, ci * 7));
      state[cfg.id] = { cfg, series, i: 24, phase: ci * 7, dir: true };
    });

    const build = () => {
      const out = {};
      Object.values(state).forEach((s) => {
        out[s.cfg.id] = { ...botFromSeries(s.cfg, s.series, s.dir), __series: s.series };
      });
      setData(out);
    };

    build();
    const iv = setInterval(() => {
      Object.values(state).forEach((s) => {
        s.i += 1;
        if (s.i % 5 === 0) s.dir = !s.dir;
        s.series = [...s.series.slice(-39), genPoint(s.i, s.phase)];
      });
      build();
    }, 2000);

    return () => clearInterval(iv);
  }, [enabled]);

  return data;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
// Obstacle / Rain / Alarm plotted as three stacked 0-1 lanes (a digital trace).
const LANES = [
  { key: 'Alarm', src: 'alarm', offset: 3.0, color: '#a855f7' },
  { key: 'Rain', src: 'rain', offset: 1.5, color: '#f59e0b' },
  { key: 'Obstacle', src: 'obstacle', offset: 0.0, color: '#ef4444' },
];

function EventTrace({ data }) {
  const trace = data.map((d) => {
    const row = { t: d.t };
    LANES.forEach((l) => { row[l.key] = d[l.src] + l.offset; });
    return row;
  });
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        {LANES.map((l) => (
          <span key={l.key} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} /> {l.key}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <LineChart data={trace} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
          <XAxis dataKey="t" hide />
          <YAxis domain={[-0.3, 4.3]} hide />
          {LANES.map((l) => (
            <Line key={l.key} type="stepAfter" dataKey={l.key} stroke={l.color}
              strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PwmChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
        <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={40} />
        <YAxis tick={{ fontSize: 9 }} domain={[0, 255]} width={30} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)' }}
          labelStyle={{ fontWeight: 700 }}
        />
        <Line type="monotone" dataKey="pwm" name="PWM" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="rpm" name="RPM" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Controls (admin only, live robots only)
// ---------------------------------------------------------------------------
function Controls({ id, powerOn = false, online = true, alarmActive = false }) {
  const push = useToast();
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(45);
  const [mode, setMode] = useState('AUTO'); // last mode this session
  const [dir, setDir] = useState('FORWARD'); // last drive direction this session

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      push(`${label} sent to ${id}`, 'success');
    } catch (e) {
      push(`${label} failed: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setPower = (on) => run(`Power ${on ? 'ON' : 'OFF'}`,
    () => sendRobotCommand(id, 'POWER', on ? 'ON' : 'OFF'));

  const setModeCmd = (m) => run(`${m === 'AUTO' ? 'Auto' : 'Manual'} mode`, async () => {
    await sendRobotCommand(id, 'SET_MODE', m);
    setMode(m);
  });

  const sendSpeed = () => run(`Speed ${speed} rpm`, async () => {
    await sendRobotCommand(id, 'SET_MODE', 'MANUAL');
    await sendRobotCommand(id, 'SET_RPM', speed);
    setMode('MANUAL');
  });

  const setDirCmd = (d) => run(`${d === 'FORWARD' ? 'Forward' : 'Reverse'} direction`, async () => {
    await sendRobotCommand(id, 'SET_DIR', d);
    setDir(d);
  });

  const setBuzzer = (on) => run(`Buzzer ${on ? 'ON' : 'OFF'}`,
    () => sendRobotCommand(id, 'BUZZER', on ? 'ON' : 'OFF'));

  const btn = 'px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40 cursor-pointer';
  // small greyed helper label above each control group
  const grp = 'text-[9px] font-black uppercase tracking-widest text-muted mb-1.5';

  return (
    <div className="mt-4 pt-4 border-t border-line space-y-4">
      {/* Power on/off — both disabled until the robot is connected */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={grp}>
            Power · <span className={!online ? 'text-slate-400' : powerOn ? 'text-accent' : 'text-slate-400'}>
              {!online ? 'Disconnected' : powerOn ? 'On' : 'Off'}
            </span>
          </span>
          <span className={`h-2 w-2 rounded-full ${!online ? 'bg-slate-400' : powerOn ? 'bg-accent-fill' : 'bg-slate-400'}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy || !online || powerOn} onClick={() => setPower(true)}
            className={`${btn} bg-soft text-accent hover:bg-accent hover:text-white`}>⏻ Power On</button>
          <button disabled={busy || !online || !powerOn} onClick={() => setPower(false)}
            className={`${btn} bg-danger-soft text-danger hover:bg-danger hover:text-white`}>⏻ Power Off</button>
        </div>
        {!online && (
          <p className="text-[9px] font-bold text-muted mt-1.5">Robot disconnected — power controls disabled until it reconnects.</p>
        )}
      </div>

      {/* Operation */}
      <div>
        <div className={grp}>Operation</div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={() => run('Start Cycle', () => sendRobotCommand(id, 'CMD_START_CYCLE'))}
            className={`${btn} bg-soft text-accent hover:bg-accent hover:text-white`}>▶ Start Cleaning</button>
          <button disabled={busy} onClick={() => run('Dock', () => sendRobotCommand(id, 'CMD_DOCK'))}
            className={`${btn} bg-sunk text-ink hover:bg-slate-200`}>■ Stop / Dock</button>
          <button disabled={busy} onClick={() => run('Reset', () => sendRobotCommand(id, 'RESET'))}
            className={`${btn} bg-sunk text-muted hover:text-ink`}>↺ Reset</button>
        </div>
      </div>

      {/* Alarm buzzer */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={grp}>
            Alarm · <span className={alarmActive ? 'text-danger' : 'text-slate-400'}>{alarmActive ? 'Sounding' : 'Silent'}</span>
          </span>
          <span className={`h-2 w-2 rounded-full ${alarmActive ? 'bg-danger animate-pulse' : 'bg-slate-400'}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy || !online} onClick={() => setBuzzer(true)}
            className={`${btn} bg-danger-soft text-danger hover:bg-danger hover:text-white`}>🔔 Sound Buzzer</button>
          <button disabled={busy || !online} onClick={() => setBuzzer(false)}
            className={`${btn} bg-sunk text-ink hover:bg-slate-200`}>🔕 Silence</button>
        </div>
      </div>

      {/* Drive mode */}
      <div>
        <div className={grp}>Drive Mode</div>
        <div className="flex items-center gap-2">
          <button disabled={busy} onClick={() => setModeCmd('AUTO')}
            className={`${btn} flex-1 ${mode === 'AUTO' ? 'bg-accent text-white' : 'bg-sunk text-muted hover:text-ink'}`}>Auto</button>
          <button disabled={busy} onClick={() => setModeCmd('MANUAL')}
            className={`${btn} flex-1 ${mode === 'MANUAL' ? 'bg-accent text-white' : 'bg-sunk text-muted hover:text-ink'}`}>Manual</button>
        </div>
      </div>

      {/* Direction */}
      <div>
        <div className={grp}>Direction</div>
        <div className="flex items-center gap-2">
          <button disabled={busy} onClick={() => setDirCmd('REVERSE')}
            className={`${btn} flex-1 ${dir === 'REVERSE' ? 'bg-accent text-white' : 'bg-sunk text-muted hover:text-ink'}`}>◀ Reverse</button>
          <button disabled={busy} onClick={() => setDirCmd('FORWARD')}
            className={`${btn} flex-1 ${dir === 'FORWARD' ? 'bg-accent text-white' : 'bg-sunk text-muted hover:text-ink'}`}>Forward ▶</button>
        </div>
      </div>

      {/* Manual speed */}
      <div>
        <div className={grp}>Manual Speed (switches to Manual)</div>
        <div className="flex items-center gap-3">
          <input type="range" min="0" max="100" value={speed} disabled={busy}
            onChange={(e) => setSpeed(Number(e.target.value))}
            onMouseUp={sendSpeed} onTouchEnd={sendSpeed}
            className="flex-1 accent-emerald-500" />
          <span className="text-xs font-black text-ink w-14 text-right tabular-nums">{speed} rpm</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
function RobotCard({ id, bot, canControl, demoSeries }) {
  const r = bot.robot || {};
  const isDemo = !!demoSeries;
  const online = bot.status !== 'OFFLINE';
  const faulted = bot.status === 'FAULT' || r.motor_status === 'FAULT';
  const [showHistory, setShowHistory] = useState(true);

  // Skip the network fetch entirely in demo mode (null key = no request).
  const { data: history } = useRobotHistory(isDemo ? null : id);
  const series = isDemo ? demoSeries : Array.isArray(history) ? history : [];

  const pwm = Number(r.motor_pwm) || 0;
  const pwmPct = Math.round((pwm / 255) * 100);
  const motorTone = r.motor_status === 'FAULT' ? 'bad' : r.motor_status === 'RUNNING' ? 'ok' : 'idle';

  return (
    <div className={`bg-surface rounded-[2rem] border p-5 shadow-elev ${faulted ? 'border-danger/40' : 'border-line'}`}>
      {/* header */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-ink tracking-tight truncate">{bot.farm_name || id}</h3>
            {isDemo && <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">Demo</span>}
          </div>
          <p className="text-[10px] font-black text-muted uppercase tracking-widest">{bot.city || 'Unknown'}</p>
        </div>
        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
          !online ? 'bg-sunk text-muted' : faulted ? 'bg-danger-soft text-danger' : 'bg-soft text-accent'
        }`}>
          <span className={`h-2 w-2 rounded-full ${!online ? 'bg-slate-400' : faulted ? 'bg-danger animate-pulse' : 'bg-accent-fill'}`} />
          {!online ? 'Offline' : faulted ? 'Fault' : 'Live'}
        </span>
      </div>

      {/* signal grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Tile label="Power" value={r.power_state ? 'ON' : 'OFF'} tone={r.power_state ? 'ok' : 'idle'} />
        <Tile label="Motor" value={r.motor_status || 'IDLE'} tone={motorTone} />
        <Tile label="Direction" value={`${DIR_ARROW[r.motor_direction] || '■'} ${r.motor_direction || 'STOP'}`}
          tone={r.motor_direction && r.motor_direction !== 'STOP' ? 'ok' : 'idle'} />
        <Tile label="Motor PWM" value={`${pwm}`} sub={`${pwmPct}% · ${Number(bot.motor_speed || 0).toFixed(0)} rpm`}
          tone={pwm > 0 ? 'ok' : 'idle'} />
        <Tile label="Rain" value={r.rain_status ? 'WET' : 'DRY'} tone={r.rain_status ? 'warn' : 'idle'} />
        <Tile label="Obstacle" value={r.obstacle_detected ? 'BLOCKED' : 'CLEAR'} tone={r.obstacle_detected ? 'bad' : 'idle'} />
        <Tile label="Alarm" value={r.alarm_active ? 'SOUNDING' : 'SILENT'} tone={r.alarm_active ? 'bad' : 'idle'} pulse={!!r.alarm_active} />
        <Tile label="Battery" value={`${Math.round(bot.battery_percentage || 0)}%`} tone={(bot.battery_percentage || 0) < 20 ? 'bad' : 'idle'} />
      </div>

      {/* PWM bar */}
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-sunk overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${faulted ? 'bg-danger' : 'bg-accent-fill'}`}
            style={{ width: `${pwmPct}%` }} />
        </div>
      </div>

      {/* history charts */}
      <div className="mt-4 pt-4 border-t border-line">
        <button onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted hover:text-ink transition-colors cursor-pointer">
          <span>{showHistory ? '▾' : '▸'}</span> History
          <span className="text-[9px] opacity-60">({series.length} pts)</span>
        </button>
        {showHistory && (
          series.length === 0 ? (
            <p className="text-[11px] font-bold text-muted mt-3">Collecting data… charts appear once packets arrive.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">PWM &amp; RPM over time</p>
                <PwmChart data={series} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Events over time</p>
                <EventTrace data={series} />
              </div>
            </div>
          )
        )}
      </div>

      {/* controls (admin only; hidden in demo since commands have no target) */}
      {canControl && !isDemo && (
        <Controls id={id} powerOn={!!r.power_state} online={online} alarmActive={!!r.alarm_active} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function RobotMonitor({ botStatus = {}, canControl = false }) {
  const realIds = Object.keys(botStatus);
  // Default to demo when nothing real is reporting, but let the user toggle.
  const [demo, setDemo] = useState(realIds.length === 0);
  const demoData = useDemoData(demo);

  const source = demo ? demoData : botStatus;
  const ids = Object.keys(source);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-ink tracking-tight italic">Robot Control &amp; Monitor</h2>
          <p className="text-muted text-xs font-bold uppercase tracking-widest mt-1">
            {demo
              ? 'Demo preview · simulated signals · updates every 2s'
              : `Live drive & cleaning-head signals · ${ids.length} unit${ids.length === 1 ? '' : 's'} · refreshes every 5s`}
          </p>
        </div>
        <button
          onClick={() => setDemo((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
            demo ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10' : 'bg-surface text-muted border-line hover:text-ink'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${demo ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
          Demo preview {demo ? 'On' : 'Off'}
        </button>
      </header>

      {demo && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400">
          Showing simulated robots so you can preview the layout. Connect a robot (or start the edge simulator) and turn Demo off to see live data.
        </div>
      )}

      {ids.length === 0 ? (
        <div className="bg-surface rounded-[2rem] border border-line p-12 text-center text-muted font-bold">
          No robots reporting yet. Turn on <span className="text-ink">Demo preview</span> above, or start the edge simulator
          (<code className="text-ink">npm run start:edge</code>).
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {ids.map((id) => (
            <RobotCard key={id} id={id} bot={source[id]} canControl={canControl} demoSeries={demo ? source[id].__series : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
