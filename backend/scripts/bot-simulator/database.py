"""
MySQL / MariaDB data-access layer for the SCADA simulator.

Migrated from MongoDB (pymongo). The simulator still builds rich *nested*
packet dicts; `insert_packet()` flattens them into the flat `scada_packets`
columns and writes the embedded faults into the `packet_faults` table.

Connection settings are read from backend/.env (two levels up) so they stay
in sync with the Node backend.
"""
import os
from datetime import datetime

import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv

# backend/.env  (this file lives at backend/scripts/bot-simulator/database.py)
_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(_ENV_PATH)

_DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "solar_scada"),
    "charset": "utf8mb4",
    "autocommit": True,
    "cursorclass": DictCursor,
}


def get_conn():
    """Open a fresh connection. Callers close it (or use `with`)."""
    return pymysql.connect(**_DB_CONFIG)


# --- Farms --------------------------------------------------------------
def fetch_all_farms():
    """Return every farm as a list of dicts (no internal _id)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT farm_id, name, city, capacity, lat, lng FROM farms")
        return list(cur.fetchall())


def upsert_farm(farm):
    """Insert or update a farm keyed on farm_id."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO farms (farm_id, name, city, capacity, lat, lng)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE
                 name = VALUES(name), city = VALUES(city),
                 capacity = VALUES(capacity), lat = VALUES(lat), lng = VALUES(lng)""",
            (
                farm.get("farm_id"),
                farm.get("name"),
                farm.get("city"),
                farm.get("capacity"),
                farm.get("lat"),
                farm.get("lng"),
            ),
        )


def delete_farm(farm_id):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM farms WHERE farm_id = %s", (farm_id,))


def delete_packets_for_farm(farm_id):
    # packet_faults rows cascade-delete via their FK to scada_packets.
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM scada_packets WHERE farm_id = %s", (farm_id,))


# --- Packets ------------------------------------------------------------
def _parse_ts(value):
    """Accept ISO strings / datetime / None and return a datetime."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now()


def _flatten(packet):
    """Map a nested simulator packet onto flat scada_packets columns."""
    el = packet.get("electrical", {}) or {}
    env = packet.get("environmental", {}) or {}
    chip = packet.get("stm32_chip", {}) or {}
    weather = packet.get("weather_context", {}) or {}
    loc = packet.get("location", {}) or {}
    robot = packet.get("robot", {}) or {}
    faults = packet.get("faults", []) or []

    battery_v = chip.get("battery_v")
    battery_pct = None
    if battery_v is not None:
        battery_pct = max(0, min(100, round((battery_v - 3.0) / 1.2 * 100)))

    error_code = 0
    if faults:
        digits = "".join(ch for ch in str(faults[0].get("code", "")) if ch.isdigit())
        error_code = int(digits) if digits else 0

    return {
        "packet_id": packet.get("packet_id"),
        "farm_id": packet.get("farm_id"),
        "farm_name": packet.get("farm_name"),
        "city": packet.get("city"),
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "timestamp": _parse_ts(packet.get("timestamp")),
        "motor_speed": packet.get("motor_speed"),
        "ac_power_kw": el.get("ac_power_kw"),
        "dc_voltage_v": el.get("dc_voltage_v"),
        "voltage_solar_panel": el.get("dc_voltage_v"),
        "dc_current_a": el.get("dc_current_a"),
        "running_current": el.get("dc_current_a"),
        "frequency_hz": el.get("frequency_hz"),
        "irradiance_wm2": env.get("irradiance_wm2"),
        "panel_temp_c": env.get("panel_temp_c"),
        "ambient_temp_c": env.get("ambient_temp_c"),
        "temperature": env.get("panel_temp_c"),
        "humidity": weather.get("humidity"),
        "chip_temp_c": chip.get("chip_temp_c"),
        "battery_v": battery_v,
        "battery_percentage": battery_pct,
        "weather_condition": weather.get("condition"),
        "row_id": packet.get("row_id"),
        "panel_id": packet.get("panel_id"),
        "row_no": packet.get("row_no"),
        "panel_no": packet.get("panel_no"),
        "device_state": 2 if packet.get("status") == "FAULT" else 1,
        "error_code": error_code,
        "status": packet.get("status", "NORMAL"),
        # robot live-tracking signals
        "motor_direction": robot.get("motor_direction"),
        "motor_pwm": robot.get("motor_pwm"),
        "power_state": robot.get("power_state"),
        "rain_status": robot.get("rain_status"),
        "motor_status": robot.get("motor_status"),
        "obstacle_detected": robot.get("obstacle_detected"),
        "alarm_active": robot.get("alarm_active"),
    }


# MySQL keywords used as column names need backticks.
_QUOTED = {"timestamp"}


def insert_packet(packet):
    """Flatten + insert one packet, then persist its embedded faults."""
    row = _flatten(packet)
    faults = packet.get("faults", []) or []

    cols = list(row.keys())
    col_sql = ", ".join(f"`{c}`" if c in _QUOTED else c for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    values = [row[c] for c in cols]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO scada_packets ({col_sql}) VALUES ({placeholders})",
            values,
        )
        packet_ref = cur.lastrowid

        for f in faults:
            cur.execute(
                """INSERT INTO packet_faults
                     (packet_ref, farm_id, code, name, severity, triggered_by,
                      row_id, panel_id, `timestamp`)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    packet_ref,
                    row.get("farm_id"),
                    f.get("code"),
                    f.get("name"),
                    f.get("severity"),
                    f.get("triggered_by"),
                    f.get("row_id") or row.get("row_id"),
                    f.get("panel_id") or row.get("panel_id"),
                    _parse_ts(f.get("timestamp")),
                ),
            )
