const mysql = require("mysql2/promise");
const env = require("./env");

// dateStrings: DATETIME values come back as raw "YYYY-MM-DD HH:MM:SS.ffffff"
// strings (UTC, exactly as Django stored them) — no implicit JS Date/tz conversion.
const pool = mysql.createPool({
  ...env.db,
  charset: "utf8mb4",
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
});
pool.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, query };
