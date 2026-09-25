import useSWR from 'swr';

const API = 'http://localhost:5050';
const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r)));

// Live ThingSpeak snapshot for a farm, polled every 15s (matches server cache).
export function useLiveTelemetry(farmId) {
  return useSWR(farmId ? `${API}/api/telemetry/${farmId}/last` : null, fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: false,
  });
}

// ThingSpeak history (server-side averaged) for charts.
export function useTelemetryHistory(farmId, { days = 7, average = 60 } = {}) {
  const key = farmId ? `${API}/api/telemetry/${farmId}/history?days=${days}&average=${average}` : null;
  return useSWR(key, fetcher, { refreshInterval: 60000, revalidateOnFocus: false });
}

// Robot signal history (PWM / obstacle / rain / alarm) for the Robot Monitor charts.
export function useRobotHistory(farmId, { limit = 40 } = {}) {
  const key = farmId
    ? `${API}/api/fakedataRoutes/robot-history/${encodeURIComponent(farmId)}?limit=${limit}`
    : null;
  return useSWR(key, fetcher, { refreshInterval: 10000, revalidateOnFocus: false });
}

// Send a control command to a robot (SIM relays to Python; LIVE writes Blynk pins).
export async function sendRobotCommand(farmId, command, value) {
  const res = await fetch(`${API}/api/commands/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ farm_id: farmId, command, value }),
  });
  if (!res.ok) throw new Error(`Command ${command} failed (${res.status})`);
  return res.json();
}

// Blynk hardware-connection state — drives the LIVE online badge.
export function useConnection(farmId) {
  return useSWR(farmId ? `${API}/api/control/${farmId}/connection` : null, fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: false,
  });
}
