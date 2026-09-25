/*
 * esp32_mqtt_robot.ino — reference firmware: publish robot status to EMQX,
 * and receive commands back from the dashboard.
 *
 * STATUS out:  kleanobotics/robots/<FARM_ID>/status   (JSON, every 3s)
 * COMMANDS in: kleanobotics/robots/<FARM_ID>/cmd       (JSON: {command,value,ts})
 *
 * Board: ESP32.  Libraries: WiFi, PubSubClient, ArduinoJson (v6),
 *                 WiFiClientSecure (for EMQX Cloud TLS on 8883).
 * Set WIFI_*, MQTT_*, FARM_ID before flashing. FARM_ID must be registered in
 * the dashboard under Manage Farms.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-password";

// EMQX Cloud Serverless example (TLS). For local EMQX use port 1883 + WiFiClient (no TLS).
const char* MQTT_HOST = "xxxx.emqxsl.com";
const int   MQTT_PORT = 8883;
const char* MQTT_USER = "your-mqtt-user";
const char* MQTT_PASS = "your-mqtt-pass";

const char* FARM_ID = "rooftop-a";

char topicStatus[64];
char topicCmd[64];

WiFiClientSecure net;          // use plain `WiFiClient net;` for non-TLS local broker
PubSubClient mqtt(net);

unsigned long lastPub = 0;
const unsigned long PUB_INTERVAL = 3000;

void onCommand(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* command = doc["command"] | "";
  Serial.printf("CMD: %s value=%s\n", command, doc["value"].as<String>().c_str());
  // TODO: act on CMD_START_CYCLE / CMD_DOCK / SET_MODE / SET_RPM / RESET
}

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf("\nWiFi %s\n", WiFi.localIP().toString().c_str());
}

void connectMqtt() {
  while (!mqtt.connected()) {
    String cid = "robot-" + String(FARM_ID) + "-" + String(random(0xffff), HEX);
    if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
      mqtt.subscribe(topicCmd, 1);
      Serial.printf("MQTT connected. Sub %s\n", topicCmd);
    } else {
      Serial.printf("MQTT rc=%d, retry in 3s\n", mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  snprintf(topicStatus, sizeof(topicStatus), "kleanobotics/robots/%s/status", FARM_ID);
  snprintf(topicCmd,    sizeof(topicCmd),    "kleanobotics/robots/%s/cmd",    FARM_ID);
  connectWifi();
  net.setInsecure();            // quick start; for production load the EMQX CA cert instead
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  // TODO: pinMode() for motor driver, rain sensor, obstacle sensor, buzzer.
}

void publishStatus() {
  // ---- Replace with your real sensor/motor reads ----
  int   motorPwm = 200;                 // 0..255
  const char* dir = "FORWARD";          // FORWARD | REVERSE | STOP
  const char* mStat = "RUNNING";        // RUNNING | IDLE | FAULT
  int   rain = digitalRead(4);
  int   obstacle = digitalRead(5);
  int   alarm = (rain || obstacle) ? 1 : 0;
  float rpm = motorPwm / 255.0 * 60.0;
  int   battery = 82;
  // ---------------------------------------------------

  StaticJsonDocument<384> doc;
  doc["farm_id"]           = FARM_ID;
  doc["motor_direction"]   = dir;
  doc["motor_pwm"]         = motorPwm;
  doc["motor_speed"]       = rpm;
  doc["motor_status"]      = mStat;
  doc["power_state"]       = 1;
  doc["rain_status"]       = rain;
  doc["obstacle_detected"] = obstacle;
  doc["alarm_active"]      = alarm;
  doc["battery_percentage"] = battery;

  char buf[384];
  size_t n = serializeJson(doc, buf);
  mqtt.publish(topicStatus, buf, n);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  if (millis() - lastPub >= PUB_INTERVAL) {
    lastPub = millis();
    publishStatus();
  }
  // ... your navigation/motor control loop ...
}
