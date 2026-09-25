import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useToast } from '../common/Toast';

const API = 'http://localhost:5050';

const TS_FIELDS = [
  ['voltage_v', 'field1 · V'], ['current_a', 'field2 · A'], ['temperature_c', 'field3 · °C'],
  ['rain', 'field4 · rain'], ['tracker_angle', 'field5 · angle'], ['soc', 'field6 · SoC'],
  ['power_kw', 'field7 · kW'], ['panel_idx', 'field8 · panel'],
];

const BLYNK_COMMANDS = [
  { command: 'SET_RPM', label: 'Set motor % (V1)', hasValue: true, ph: '55' },
  { command: 'SET_MODE', label: 'Set mode (V0)', hasValue: true, ph: 'MANUAL / AUTO' },
  { command: 'CMD_START_CYCLE', label: 'Start cycle (V2)', hasValue: false },
  { command: 'CMD_DOCK', label: 'Dock (V3)', hasValue: false },
  { command: 'RESET', label: 'Reset (V4)', hasValue: false },
];

function JsonBox({ data }) {
  return (
    <pre className="mt-3 max-h-64 overflow-auto text-[11px] leading-relaxed bg-sunk text-ink rounded-2xl p-4 font-mono border border-line">
      {data == null ? '—' : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-sunk rounded-xl p-3">
      <p className="text-[9px] font-black text-muted uppercase tracking-widest truncate">{label}</p>
      <p className="text-sm font-black text-ink mt-0.5">{value ?? '—'}</p>
    </div>
  );
}

// timed fetch → { ok, status, ms, body }
async function call(url, opts) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, opts);
    const ms = Math.round(performance.now() - t0);
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ms, body };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), body: { error: e.message } };
  }
}

export default function Integrations() {
  const push = useToast();
  const [farms, setFarms] = useState([]);

  // ThingSpeak console
  const [channel, setChannel] = useState('12397');
  const [days, setDays] = useState(1);
  const [average, setAverage] = useState(60);
  const [tsResp, setTsResp] = useState(null);
  const [tsMeta, setTsMeta] = useState(null); // {status, ms, url}
  const [tsField, setTsField] = useState('power_kw');
  const [tsBusy, setTsBusy] = useState(false);

  // Blynk console
  const [farmId, setFarmId] = useState('');
  const [blynkResp, setBlynkResp] = useState(null);
  const [blynkMeta, setBlynkMeta] = useState(null);
  const [cmd, setCmd] = useState('SET_RPM');
  const [cmdVal, setCmdVal] = useState('55');
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/farms`).then((r) => r.json()).then((f) => {
      setFarms(f);
      if (f[0]) setFarmId(f[0].farm_id);
    }).catch(() => {});
  }, []);

  const fetchThingSpeak = async () => {
    setTsBusy(true);
    const url = `${API}/api/telemetry/probe?channel=${channel}&days=${days}&average=${average}`;
    const r = await call(url);
    setTsResp(r.body);
    setTsMeta({ status: r.status, ms: r.ms, url });
    setTsBusy(false);
    push(r.ok ? `ThingSpeak ${r.status} · ${r.ms}ms` : `ThingSpeak failed ${r.status}`, r.ok ? 'success' : 'error');
  };

  const blynkAction = async (kind) => {
    if (!farmId) return;
    let url = '', opts;
    if (kind === 'connection') url = `${API}/api/control/${farmId}/connection`;
    else if (kind === 'readback') url = `${API}/api/control/${farmId}/readback`;
    else if (kind === 'audit') url = `${API}/api/control/${farmId}/audit`;
    const r = await call(url, opts);
    setBlynkMeta({ status: r.status, ms: r.ms, url });
    if (kind === 'audit') setAudit(Array.isArray(r.body) ? r.body : []);
    setBlynkResp(r.body);
    push(r.ok ? `Blynk ${kind} ${r.status} · ${r.ms}ms` : `${kind} failed ${r.status}`, r.ok ? 'success' : 'error');
  };

  const sendCommand = async () => {
    if (!farmId) return;
    const url = `${API}/api/commands/send`;
    const spec = BLYNK_COMMANDS.find((c) => c.command === cmd);
    const payload = { farm_id: farmId, command: cmd, value: spec?.hasValue ? cmdVal : 1 };
    const r = await call(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    setBlynkMeta({ status: r.status, ms: r.ms, url });
    setBlynkResp(r.body);
    push(r.ok ? `Sent ${cmd} → ${r.body.target} (${r.body.latency_ms}ms)` : `Command failed`, r.ok ? 'success' : 'error');
    blynkAction('audit');
  };

  const selectedFarm = farms.find((f) => f.farm_id === farmId);
  const chartData = (tsResp?.series || []).map((p) => ({
    time: new Date(p.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    value: p[tsField],
  }));

  return (
    <div className="p-6 md:p-8 space-y-6 bg-page min-h-full">
      <header>
        <h2 className="text-2xl font-black text-ink tracking-tight italic">Integrations · Live API Console</h2>
        <p className="text-[11px] font-black text-muted uppercase tracking-[.08em] mt-1">
          ThingSpeak (read) &amp; Blynk (control) — proxied server-side, keys never leave the server
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ================= ThingSpeak ================= */}
        <section className="bg-surface rounded-3xl border border-line shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-ink uppercase tracking-widest">ThingSpeak · Read / History</h3>
            <span className="text-[9px] font-black uppercase tracking-widest text-accent bg-soft px-2 py-1 rounded-full">GET proxy</span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[120px]">
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Channel ID</span>
              <input value={channel} onChange={(e) => setChannel(e.target.value)}
                className="w-full mt-1 bg-page border border-line rounded-xl px-3 py-2 text-sm font-bold text-ink outline-none focus:border-accent" />
            </label>
            <label>
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Days</span>
              <input type="number" value={days} onChange={(e) => setDays(e.target.value)}
                className="w-20 mt-1 bg-page border border-line rounded-xl px-3 py-2 text-sm font-bold text-ink outline-none focus:border-accent" />
            </label>
            <label>
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Average (min)</span>
              <select value={average} onChange={(e) => setAverage(Number(e.target.value))}
                className="mt-1 bg-page border border-line rounded-xl px-3 py-2 text-sm font-bold text-ink outline-none focus:border-accent">
                {[10, 15, 20, 30, 60, 240, 720, 1440].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <button onClick={fetchThingSpeak} disabled={tsBusy}
              className="px-5 py-2.5 rounded-xl bg-ink text-surface text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
              {tsBusy ? 'Fetching…' : 'Fetch'}
            </button>
          </div>

          {tsMeta && (
            <p className="text-[10px] font-mono text-muted break-all">
              <span className={tsMeta.status === 200 ? 'text-accent' : 'text-danger'}>{tsMeta.status}</span> · {tsMeta.ms}ms · {tsMeta.url}
            </p>
          )}

          {tsResp?.channel && (
            <div className="text-xs font-bold text-ink">
              Channel: <span className="text-accent">{tsResp.channel.name}</span> (id {tsResp.channel.id})
            </div>
          )}

          {tsResp?.last && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TS_FIELDS.map(([k, label]) => (
                <Stat key={k} label={tsResp.channel?.field_names?.[label.split(' · ')[0]] || label} value={
                  tsResp.last[k] != null ? (typeof tsResp.last[k] === 'number' ? tsResp.last[k].toFixed(2) : tsResp.last[k]) : '—'
                } />
              ))}
            </div>
          )}

          {chartData.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {TS_FIELDS.map(([k, label]) => (
                  <button key={k} onClick={() => setTsField(k)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${tsField === k ? 'bg-accent text-white' : 'bg-sunk text-muted'}`}>
                    {label.split(' · ')[0]}
                  </button>
                ))}
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {tsResp && <details><summary className="text-[10px] font-black text-muted uppercase tracking-widest cursor-pointer">Raw JSON</summary><JsonBox data={tsResp} /></details>}
        </section>

        {/* ================= Blynk ================= */}
        <section className="bg-surface rounded-3xl border border-line shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-ink uppercase tracking-widest">Blynk · Write / Control</h3>
            <span className="text-[9px] font-black uppercase tracking-widest text-info bg-blue-50 px-2 py-1 rounded-full">blr1.blynk.cloud</span>
          </div>

          <label className="block">
            <span className="text-[10px] font-black text-muted uppercase tracking-widest">Farm / Device</span>
            <select value={farmId} onChange={(e) => setFarmId(e.target.value)}
              className="w-full mt-1 bg-page border border-line rounded-xl px-3 py-2 text-sm font-bold text-ink outline-none focus:border-accent">
              {farms.map((f) => (
                <option key={f.farm_id} value={f.farm_id}>
                  {f.name} — {f.data_source || 'SIM'}{f.has_blynk ? ' · Blynk' : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedFarm && (
            <p className="text-[10px] font-bold text-muted">
              {selectedFarm.has_blynk ? '🟢 LIVE Blynk device — real pin writes' : '⚪ SIM — routes to the Python simulator'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => blynkAction('connection')} className="px-4 py-2 rounded-xl bg-sunk text-ink text-[10px] font-black uppercase tracking-widest hover:bg-line">isHardwareConnected</button>
            <button onClick={() => blynkAction('readback')} className="px-4 py-2 rounded-xl bg-sunk text-ink text-[10px] font-black uppercase tracking-widest hover:bg-line">Readback V10–V15</button>
            <button onClick={() => blynkAction('audit')} className="px-4 py-2 rounded-xl bg-sunk text-ink text-[10px] font-black uppercase tracking-widest hover:bg-line">Audit trail</button>
          </div>

          {/* Command sender */}
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <label className="flex-1 min-w-[160px]">
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Command</span>
              <select value={cmd} onChange={(e) => setCmd(e.target.value)}
                className="w-full mt-1 bg-page border border-line rounded-xl px-3 py-2 text-sm font-bold text-ink outline-none focus:border-accent">
                {BLYNK_COMMANDS.map((c) => <option key={c.command} value={c.command}>{c.label}</option>)}
              </select>
            </label>
            {BLYNK_COMMANDS.find((c) => c.command === cmd)?.hasValue && (
              <label>
                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Value</span>
                <input value={cmdVal} onChange={(e) => setCmdVal(e.target.value)}
                  placeholder={BLYNK_COMMANDS.find((c) => c.command === cmd)?.ph}
                  className="w-28 mt-1 bg-page border border-line rounded-xl px-3 py-2 text-sm font-bold text-ink outline-none focus:border-accent" />
              </label>
            )}
            <button onClick={sendCommand} className="px-5 py-2.5 rounded-xl bg-accent text-white text-[10px] font-black uppercase tracking-widest">Send →</button>
          </div>

          {blynkMeta && (
            <p className="text-[10px] font-mono text-muted break-all">
              <span className={blynkMeta.status === 200 ? 'text-accent' : 'text-danger'}>{blynkMeta.status}</span> · {blynkMeta.ms}ms · {blynkMeta.url}
            </p>
          )}
          {blynkResp && <JsonBox data={blynkResp} />}

          {audit.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Audit trail (latest)</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {audit.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-[11px] font-bold bg-sunk rounded-lg px-3 py-1.5">
                    <span className="text-ink">{a.command} {a.value ? `=${a.value}` : ''}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted">{a.target}</span>
                      <span className={`text-[9px] font-black ${a.status === 'ACK' ? 'text-accent' : 'text-danger'}`}>{a.status}</span>
                      <span className="text-muted">{a.latency_ms}ms</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
