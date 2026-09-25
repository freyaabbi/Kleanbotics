// initDb.js — create the database + tables from schema.sql.
// Replaces the old startMemoryDb.js (mongodb-memory-server). Idempotent:
// every statement uses CREATE ... IF NOT EXISTS, so it is safe to re-run.
//
// Usage:  node initDb.js        (run once before the first `npm start`)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  console.log("⏳ Applying schema.sql to MySQL...");

  // The database + user already exist (setup_mysql.sql, run once as root),
  // so connect straight to the target DB. multipleStatements lets us run the
  // whole schema file at once.
  const dbName = process.env.DB_NAME || "solar_scada";
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: dbName,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log(`✅ Schema applied. Tables are ready in \`${dbName}\`.`);

    // Idempotent migration: add any columns that CREATE TABLE IF NOT EXISTS
    // won't touch on an already-existing table. Works on both MySQL 8 and
    // MariaDB (checks information_schema instead of using ADD IF NOT EXISTS).
    await addMissingColumns(conn, dbName, "scada_packets", {
      motor_direction: "VARCHAR(8)  DEFAULT NULL",
      motor_pwm: "INT         DEFAULT NULL",
      power_state: "TINYINT     DEFAULT NULL",
      rain_status: "TINYINT     DEFAULT NULL",
      motor_status: "VARCHAR(12) DEFAULT NULL",
      obstacle_detected: "TINYINT DEFAULT NULL",
      alarm_active: "TINYINT     DEFAULT NULL",
    });
  } finally {
    await conn.end();
  }
}

// Add each column only if it is not already present on the table.
async function addMissingColumns(conn, dbName, table, columns) {
  const [existing] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  const have = new Set(existing.map((r) => r.COLUMN_NAME));
  for (const [name, def] of Object.entries(columns)) {
    if (have.has(name)) continue;
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${def}`);
    console.log(`  ➕ added ${table}.${name}`);
  }
}

run().catch((err) => {
  console.error("❌ Failed to initialise database:", err.message);
  process.exit(1);
});
