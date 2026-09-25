/*
 * esp32_robot_ingest.ino — reference firmware: post robot status to the dashboard.
 *
 * Reads your real sensor/motor states and POSTs them as JSON to the Node API
 * (POST /api/telemetry/ingest) every few seconds. The dashboard's Robot Monitor
 * reads these directly — no other wiring needed.
 *
 * Board: any ESP32. Libraries: WiFi, HTTPClient, ArduinoJson (v6).
 * Before flashing: set WIFI_*, SERVER_URL, FARM_ID (must be registered in the
 * dashboard under Manage Farms), and INGEST_KEY (match backend/.env, or "").
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-password";

// Use the machine/host running the Node API. Not "localhost" — that is the ESP32 itself.
const char* SERVER_URL = "http://192.168.1.50:5050/api/telemetry/ingest";
const char* FARM_ID    = "rooftop-a";   // must exist in the dashboard
const char* INGEST_KEY = "";            // set if INGEST_API_KEY is configured on the server

const unsigned long POST_INTERVAL_MS = 3000;
unsigned long lastPost = 0;

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf("\nConnected: %s\n", WiFi.localIP().toString().c_str());
}

void setup() {
  Serial.begin(115200);
  connectWifi();
  // TODO: pinMode() for your motor driver, rain sensor, ultrasonic/IR obstacle sensor, buzzer.
}

void postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) { connectWifi(); return; }

  // ---- Replace these reads with your real sensor/motor values ----
  int   motorPwm    = 200;                 // 0..255 (your analogWrite duty)
  const char* dir   = "FORWARD";           // FORWARD | REVERSE | STOP
  const char* mStat = "RUNNING";           // RUNNING | IDLE | FAULT
  int   powerOn     = 1;                    // main power relay
  int   rain        = digitalRead(4);      // rain sensor (example pin)
  int   obstacle    = digitalRead(5);      // obstacle sensor (example pin)
  int   alarm       = (rain || obstacle) ? 1 : 0;
  float rpm         = motorPwm / 255.0 * 60.0;
  int   battery     = 82;                   // % from your fuel gauge / ADC
  // ----------------------------------------------------------------

  StaticJsonDocument<384> doc;
  doc["farm_id"]           = FARM_ID;
  doc["motor_direction"]   = dir;
  doc["motor_pwm"]         = motorPwm;
  doc["motor_speed"]       = rpm;
  doc["motor_status"]      = mStat;
  doc["power_state"]       = powerOn;
  doc["rain_status"]       = rain;
  doc["obstacle_detected"] = obstacle;
  doc["alarm_active"]      = alarm;
  doc["battery_percentage"] = battery;

  String out;
  serializeJson(doc, out);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  if (strlen(INGEST_KEY) > 0) http.addHeader("x-api-key", INGEST_KEY);

  int code = http.POST(out);
  Serial.printf("POST -> %d %s\n", code, http.getString().c_str());
  http.end();
}

void loop() {
  if (millis() - lastPost >= POST_INTERVAL_MS) {
    lastPost = millis();
    postTelemetry();
  }
  // ... your motor/navigation control loop runs here ...
}
