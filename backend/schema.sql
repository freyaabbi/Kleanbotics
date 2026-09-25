-- =====================================================================
-- Solar SCADA Dashboard — MySQL / MariaDB schema (tables only)
-- Migrated from MongoDB (collections: farms, rows, panels, scada_packets)
-- Telemetry is stored FLAT (one column per field). The faults[] array
-- from the old documents lives in the related `packet_faults` table.
--
-- The database + user are created by setup_mysql.sql (run once as root).
-- initDb.js applies THIS file against the already-selected database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- farms  (was the `farms` collection)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farms (
  farm_id   VARCHAR(64)  NOT NULL,
  name      VARCHAR(191) NOT NULL,
  city      VARCHAR(128) DEFAULT NULL,
  capacity  DOUBLE       DEFAULT NULL,
  lat       DOUBLE       DEFAULT NULL,
  lng       DOUBLE       DEFAULT NULL,
  -- External integrations (secrets never leave the server).
  ts_channel_id VARCHAR(32)  DEFAULT NULL,  -- ThingSpeak channel per farm
  ts_read_key   VARCHAR(64)  DEFAULT NULL,  -- ThingSpeak read API key (private channels)
  blynk_token   VARCHAR(64)  DEFAULT NULL,  -- Blynk device auth token
  data_source   VARCHAR(8)   DEFAULT 'SIM', -- SIM | LIVE
  PRIMARY KEY (farm_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- command_log  — audit trail of every control command (Blynk or simulator)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS command_log (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  farm_id    VARCHAR(64)  DEFAULT NULL,
  command    VARCHAR(64)  DEFAULT NULL,
  value      VARCHAR(64)  DEFAULT NULL,
  pins       VARCHAR(255) DEFAULT NULL,   -- JSON of Blynk pin writes
  target     VARCHAR(16)  DEFAULT NULL,   -- BLYNK | SIMULATOR
  status     VARCHAR(16)  DEFAULT NULL,   -- SENT | ACK | FAILED
  latency_ms INT          DEFAULT NULL,
  response   TEXT,
  created_at DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_cmd_farm (farm_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- command_queue  — pending control commands a robot pulls over REST.
-- The dashboard enqueues a command (status PENDING); the robot polls
-- GET /api/commands/pending/:farm_id (-> DELIVERED) and confirms it
-- applied via POST /api/commands/ack (-> ACKED). This is the broker-less
-- (no-MQTT) control path for the PoC.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS command_queue (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  farm_id      VARCHAR(64)  NOT NULL,
  command      VARCHAR(64)  NOT NULL,
  value        VARCHAR(64)  DEFAULT NULL,
  status       VARCHAR(16)  DEFAULT 'PENDING',  -- PENDING | DELIVERED | ACKED
  created_at   DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  delivered_at DATETIME(3)  DEFAULT NULL,
  acked_at     DATETIME(3)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_queue_poll (farm_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- panel_rows  (was the `rows` collection — `rows` is reserved in MySQL 8)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS panel_rows (
  row_id       VARCHAR(96)  NOT NULL,
  farm_id      VARCHAR(64)  NOT NULL,
  row_no       INT          NOT NULL,
  label        VARCHAR(64)  DEFAULT NULL,
  panel_count  INT          DEFAULT NULL,
  orientation  VARCHAR(16)  DEFAULT NULL,
  tilt_deg     DOUBLE       DEFAULT NULL,
  status       VARCHAR(24)  DEFAULT 'NORMAL',
  PRIMARY KEY (row_id),
  KEY idx_rows_farm (farm_id, row_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- panels  (was the `panels` collection)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS panels (
  panel_id      VARCHAR(128) NOT NULL,
  farm_id       VARCHAR(64)  NOT NULL,
  row_id        VARCHAR(96)  DEFAULT NULL,
  row_no        INT          DEFAULT NULL,
  panel_no      INT          DEFAULT NULL,
  label         VARCHAR(64)  DEFAULT NULL,
  serial        VARCHAR(96)  DEFAULT NULL,
  wattage       DOUBLE       DEFAULT NULL,
  tilt_deg      DOUBLE       DEFAULT NULL,
  azimuth_deg   DOUBLE       DEFAULT NULL,
  status        VARCHAR(24)  DEFAULT 'OK',
  last_clean_at DATETIME(3)  DEFAULT NULL,
  installed_at  DATETIME(3)  DEFAULT NULL,
  PRIMARY KEY (panel_id),
  KEY idx_panels_farm (farm_id, row_no, panel_no),
  KEY idx_panels_row (row_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- scada_packets  (was the `scada_packets` collection) — flattened
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scada_packets (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  packet_id     VARCHAR(64)  DEFAULT NULL,

  -- routing / hierarchy
  farm_id       VARCHAR(64)  DEFAULT NULL,
  farm_name     VARCHAR(191) DEFAULT NULL,
  city          VARCHAR(128) DEFAULT NULL,
  device_id     INT          DEFAULT NULL,
  row_id        VARCHAR(96)  DEFAULT NULL,
  panel_id      VARCHAR(128) DEFAULT NULL,
  row_no        INT          DEFAULT NULL,
  panel_no      INT          DEFAULT NULL,
  lat           DOUBLE       DEFAULT NULL,
  lng           DOUBLE       DEFAULT NULL,

  -- time
  `timestamp`   DATETIME(3)  DEFAULT NULL,
  slot_start    DATETIME(3)  DEFAULT NULL,

  -- hardware telemetry (64-byte packet / readings)
  device_state        INT     DEFAULT NULL,
  fw_version          INT     DEFAULT NULL,
  temperature         DOUBLE  DEFAULT NULL,
  humidity            DOUBLE  DEFAULT NULL,
  voltage_battery     DOUBLE  DEFAULT NULL,
  voltage_solar_panel DOUBLE  DEFAULT NULL,
  running_current     DOUBLE  DEFAULT NULL,
  avg_current         DOUBLE  DEFAULT NULL,
  motor_speed         DOUBLE  DEFAULT NULL,
  panel_location      DOUBLE  DEFAULT NULL,
  battery_percentage  DOUBLE  DEFAULT NULL,
  connectivity_status INT     DEFAULT NULL,
  error_code          INT     DEFAULT 0,
  total_runtime       BIGINT  DEFAULT NULL,
  dbg_accel           BIGINT  DEFAULT NULL,
  dbg_gyro            BIGINT  DEFAULT NULL,
  dbg_rain            BIGINT  DEFAULT NULL,
  dbg_wind            BIGINT  DEFAULT NULL,
  dbg_last_err        BIGINT  DEFAULT NULL,
  motor_status_0      INT     DEFAULT NULL,
  motor_status_1      INT     DEFAULT NULL,
  general_status      INT     DEFAULT NULL,

  -- robot live-tracking signals (drive / cleaning head telemetry)
  motor_direction   VARCHAR(8)  DEFAULT NULL,  -- FORWARD | REVERSE | STOP
  motor_pwm         INT         DEFAULT NULL,  -- 0..255 duty
  power_state       TINYINT     DEFAULT NULL,  -- 1 powered / 0 off
  rain_status       TINYINT     DEFAULT NULL,  -- 1 rain detected / 0 dry
  motor_status      VARCHAR(12) DEFAULT NULL,  -- RUNNING | IDLE | FAULT
  obstacle_detected TINYINT     DEFAULT NULL,  -- 1 obstacle / 0 clear
  alarm_active      TINYINT     DEFAULT NULL,  -- 1 alarm sounding / 0 silent

  -- calculated / derived (simulator + analytics)
  ac_power_kw   DOUBLE       DEFAULT NULL,
  dc_voltage_v  DOUBLE       DEFAULT NULL,
  dc_current_a  DOUBLE       DEFAULT NULL,
  frequency_hz  DOUBLE       DEFAULT NULL,
  irradiance_wm2 DOUBLE      DEFAULT NULL,
  panel_temp_c  DOUBLE       DEFAULT NULL,
  ambient_temp_c DOUBLE      DEFAULT NULL,
  chip_temp_c   DOUBLE       DEFAULT NULL,
  battery_v     DOUBLE       DEFAULT NULL,

  status                 VARCHAR(24)  DEFAULT 'NORMAL',
  weather_condition      VARCHAR(64)  DEFAULT NULL,
  weather_recommendation VARCHAR(255) DEFAULT NULL,

  PRIMARY KEY (id),
  KEY idx_pkt_farm (farm_id),
  KEY idx_pkt_device (device_id),
  KEY idx_pkt_time (`timestamp`),
  KEY idx_pkt_panel (panel_id),
  KEY idx_pkt_row (row_id),
  KEY idx_pkt_farm_latest (farm_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- packet_faults  (was the embedded `faults[]` array on a packet)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packet_faults (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  packet_ref   BIGINT       DEFAULT NULL,
  farm_id      VARCHAR(64)  DEFAULT NULL,
  code         VARCHAR(16)  DEFAULT NULL,
  name         VARCHAR(128) DEFAULT NULL,
  severity     VARCHAR(24)  DEFAULT NULL,
  triggered_by VARCHAR(64)  DEFAULT NULL,
  row_id       VARCHAR(96)  DEFAULT NULL,
  panel_id     VARCHAR(128) DEFAULT NULL,
  `timestamp`  DATETIME(3)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_fault_packet (packet_ref),
  KEY idx_fault_panel (panel_id),
  KEY idx_fault_farm (farm_id),
  CONSTRAINT fk_fault_packet FOREIGN KEY (packet_ref)
    REFERENCES scada_packets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
