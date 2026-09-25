import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------
// MySQL / MariaDB connection pool + thin query helper.
// Namecheap cPanel hosting exposes MySQL over these standard settings —
// override them via the backend/.env file for production.
// ---------------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "solar_scada",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  queueLimit: 0,
  // Return DATE/DATETIME as JS Date objects (matches old Mongoose behaviour).
  dateStrings: false,
  namedPlaceholders: false,
});

/**
 * Run a parameterised query and return the rows (or ResultSetHeader for writes).
 * @param {string} sql
 * @param {Array} [params]
 */
export const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

/** Convenience: return the first row of a query, or null. */
export const queryOne = async (sql, params = []) => {
  const rows = await query(sql, params);
  return rows[0] || null;
};

/** Verify the pool can reach the database (called on server boot). */
const connectDB = async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("🔌 Connected to MySQL successfully!");
  } catch (err) {
    console.error("MySQL connection failed:", err.message);
    process.exit(1);
  }
};

export { pool };
export default connectDB;
