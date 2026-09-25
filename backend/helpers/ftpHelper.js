const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

async function downloadDatFile(remoteFileName) {
    const client = new ftp.Client();
    const localPath = path.join(__dirname, remoteFileName);

    try {
        console.log("[DEBUG] Connecting to FTP:", process.env.FTP_HOST);

        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        if (process.env.FTP_DIR && process.env.FTP_DIR.trim() !== "") {
            await client.cd(process.env.FTP_DIR);
        }

        console.log("[DEBUG] Downloading:", remoteFileName);
        await client.downloadTo(localPath, remoteFileName);
        
        return localPath;

    } catch (err) {
        console.error("[ERROR] FTP Error:", err.message);
        throw new Error("FTP Download failed: " + err.message);
    } finally {
        client.close();
    }
}

/**
 * PARSE DAT FILE
 * Matches the 64-byte PacketFormat_t exactly.
 */
function parseDatFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("File not found at " + filePath);
    }

    const buffer = fs.readFileSync(filePath);
    
    // CRITICAL: Must be exactly 64 bytes now
    if (buffer.length !== 64) {
        throw new Error(`Invalid packet size: Expected 64 bytes, got ${buffer.length}`);
    }

    return {
        // Offset 0: uint32_t (4 bytes)
        device_id: buffer.readUInt32LE(0),
        
        // Offset 4: uint16_t (2 bytes) - Updated from UInt8
        device_state: buffer.readUInt16LE(4),
        
        // Offset 6-21: uint16_t fields (2 bytes each)
        temperature: buffer.readUInt16LE(6) / 100,
        humidity: buffer.readUInt16LE(8) / 100,
        voltage_battery: buffer.readUInt16LE(10),
        voltage_solar_panel: buffer.readUInt16LE(12),
        running_current: buffer.readUInt16LE(14),
        avg_current: buffer.readUInt16LE(16),
        motor_speed: buffer.readUInt16LE(18) / 100,
        panel_location: buffer.readUInt16LE(20),
        
        // Offset 22-23: uint8_t (1 byte each)
        battery_percentage: buffer.readUInt8(22),
        connectivity_status: buffer.readUInt8(23),
        
        // Offset 24-59: uint32_t fields (4 bytes each)
        error_code: buffer.readUInt32LE(24),
        total_runtime: buffer.readUInt32LE(28),
        dbg_accel: buffer.readUInt32LE(32),
        dbg_gyro: buffer.readUInt32LE(36),
        dbg_rain: buffer.readUInt32LE(40),
        dbg_wind: buffer.readUInt32LE(44),
        dbg_last_err: buffer.readUInt32LE(48),
        motor_status_0: buffer.readUInt32LE(52),
        motor_status_1: buffer.readUInt32LE(56),
        
        // Offset 60-63: uint16_t (2 bytes each)
        general_status: buffer.readUInt16LE(60),
        fw_version: buffer.readUInt16LE(62)
    };
}

module.exports = { downloadDatFile, parseDatFile };