"""Quick CLI peek at the latest telemetry + fault stats (MySQL)."""
from database import get_conn

with get_conn() as conn, conn.cursor() as cur:
    print("📊 [LATEST] Latest 10 SCADA Packets:")
    print("=" * 50)

    cur.execute(
        """SELECT city, device_id, farm_id, error_code, temperature,
                  voltage_battery, motor_speed
             FROM scada_packets
            ORDER BY id DESC
            LIMIT 10"""
    )
    for doc in cur.fetchall():
        city = doc.get("city") or doc.get("farm_id") or "Unknown"
        dev_id = doc.get("device_id") or doc.get("farm_id") or "N/A"
        err_code = doc.get("error_code") or 0
        temp = doc.get("temperature") or 0
        batt = doc.get("voltage_battery") or 0
        rpm = doc.get("motor_speed") or 0

        status = "🟢 NORMAL" if err_code == 0 else f"🔴 FAULT (F{err_code})"
        print(f"[HUB {dev_id} - {city}] | {status}")
        print(f"   Temp: {temp}°C | Batt: {batt} mV | RPM: {rpm}%")
        print("-" * 50)

    print("\n⚠️ [FAULT] Fault Statistics (Error Codes):")
    print("=" * 50)

    cur.execute(
        """SELECT error_code, COUNT(*) AS count
             FROM scada_packets
            WHERE error_code > 0
            GROUP BY error_code
            ORDER BY count DESC"""
    )
    rows = cur.fetchall()
    if rows:
        for fault in rows:
            print(f"   Fault Code F{fault['error_code']}: {fault['count']} occurrences")
    else:
        print("   ✅ No faults found in the database. All systems nominal.")

    print("\n")
