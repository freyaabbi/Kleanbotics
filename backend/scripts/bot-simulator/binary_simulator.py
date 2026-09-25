import struct
import random
import time

class BinarySCADASimulator:
    def __init__(self):
        self.packet_update_count = 0
        self.total_runtime = 0

    def generate_binary_packet(self, device_id):
        self.packet_update_count += 1
        self.total_runtime += 10 

        # --- 23 VARIABLES TOTAL ---
        d_id = device_id                    # 1
        d_state = random.randint(0, 3)      # 2
        temp = int(2550)                    # 3
        hum = int(6000)                     # 4
        v_batt = 1200                       # 5
        v_solar = 2400                      # 6
        c_run = 500                         # 7
        c_avg = 480                         # 8
        speed = 3000                        # 9
        loc = 12                            # 10
        batt_p = 85                         # 11
        conn = 1                            # 12
        err = 0                             # 13
        run_t = self.total_runtime          # 14
        accel = 123456                      # 15
        gyro = 654321                       # 16
        rain = 0                            # 17
        wind = 10                           # 18
        last_e = 0                          # 19
        m0 = 1                              # 20
        m1 = 1                              # 21
        gen = 5000                          # 22
        fw = 513                            # 23

        # THE FORMAT STRING (Verified 23 characters)
        # Count check: 1(I) + 9(H) + 2(B) + 9(I) + 2(H) = 23 items
        fmt = "<IHHHHHHHHHBBIIIIIIIIIHH"

        return struct.pack(fmt, 
            d_id, d_state, temp, hum, v_batt, v_solar, c_run, c_avg, speed, loc, 
            batt_p, conn, err, run_t, accel, gyro, rain, wind, last_e, m0, m1, 
            gen, fw
        )

    def save_packet(self, device_id):
        data = self.generate_binary_packet(device_id)
        with open(f"solar_panel_{device_id}.dat", "wb") as f:
            f.write(data)
        print(f"✅ Created solar_panel_{device_id}.dat ({len(data)} bytes)")

    

if __name__ == "__main__":
    sim = BinarySCADASimulator()
    # List of IDs you want to simulate
    farm_ids = [1, 2, 3, 4, 5] 
    
    print("📡 Binary SCADA Simulator Started. Press Ctrl+C to stop.")
    try:
        while True:
            for f_id in farm_ids:
                sim.save_packet(f_id)
            print(f"🕒 Cycle complete at {time.strftime('%H:%M:%S')}. Waiting 5s...")
            time.sleep(5)
    except KeyboardInterrupt:
        print("\n🛑 Simulator stopped.")