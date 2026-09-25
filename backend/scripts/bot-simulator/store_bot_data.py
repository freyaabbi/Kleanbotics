# store_bot_data.py - read JSON packets from stdin and store them in MySQL.
# (Migrated from MongoDB.) Reuses the shared flatten+insert helper so packets
# land in the same `scada_packets` table the dashboard reads.
import json
import sys

from database import insert_packet

print("Connected to MySQL (scada_packets)\n")


def store_packet(packet_json):
    """Insert one packet with error handling."""
    try:
        packet = json.loads(packet_json)
        # Older feeds used `active_faults`; normalise to `faults`.
        if "faults" not in packet and "active_faults" in packet:
            packet["faults"] = packet.get("active_faults") or []
        insert_packet(packet)
        print("Stored packet {} (Faults: {})".format(
            packet.get("packet_id"), packet.get("faults", [])))
        return True
    except json.JSONDecodeError:
        print("Skipped invalid JSON")
        return False
    except Exception as e:
        print("Error storing packet: {}".format(e))
        return False


if __name__ == "__main__":
    count = 0
    for line in sys.stdin:
        line = line.strip()
        if line:  # Skip empty lines
            if store_packet(line):
                count += 1

    print("\nTotal packets stored: {}".format(count))
