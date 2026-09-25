-- =====================================================================
-- One-time bootstrap — run ONCE as the MySQL root user.
--   mysql -u root -p < setup_mysql.sql
-- Creates the database and a dedicated app user (used in backend/.env).
-- Change the password below before using in production.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS solar_scada
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Dedicated app user (TCP connections from Node + Python use '%').
-- mysql_native_password avoids caching_sha2 key-exchange issues on local dev.
-- Both '%' and 'localhost' are created: on Windows, connections to 127.0.0.1
-- resolve to 'localhost' and would otherwise be shadowed by built-in accounts.
CREATE USER IF NOT EXISTS 'solar'@'%' IDENTIFIED WITH mysql_native_password BY 'solar_local_2026';
CREATE USER IF NOT EXISTS 'solar'@'localhost' IDENTIFIED WITH mysql_native_password BY 'solar_local_2026';
GRANT ALL PRIVILEGES ON solar_scada.* TO 'solar'@'%';
GRANT ALL PRIVILEGES ON solar_scada.* TO 'solar'@'localhost';

FLUSH PRIVILEGES;
