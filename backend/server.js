import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./db.js";
import { startMqtt } from "./mqttClient.js";
import fakeDataRoutes from "./routes/fakedataRoutes.js";
import commandRoutes from "./routes/commandRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";
import farmRoutes from "./routes/farmRoutes.js";
import panelRoutes from "./routes/panelRoutes.js";
import telemetryRoutes from "./routes/telemetryRoutes.js";
import controlRoutes from "./routes/controlRoutes.js";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- ROUTES ---
// Handles fetching telemetry data and triggering simulated faults
app.use("/api/fakedataRoutes", fakeDataRoutes);

// Handles the Active Command Link (Two-Way SCADA Control)
app.use("/api/commands", commandRoutes);

// Handles managing solar farms (SCADA nodes) + row/panel drill-down
app.use("/api/farms", farmRoutes);

// Handles single-panel detail lookups
app.use("/api/panels", panelRoutes);

// ThingSpeak read proxy (live + history) — keys stay server-side
app.use("/api/telemetry", telemetryRoutes);

// Blynk control proxy (connection, readback, log-event, audit trail)
app.use("/api/control", controlRoutes);

// Handles fetching historical database telemetry records
app.use("/api", historyRoutes); 

const PORT = process.env.PORT || 5000;

// Start Server + DB Connect
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Connect to Database
  try {
    await connectDB();
    console.log(`🔌 Connected to MySQL. Listening for physical/simulated hardware connections...`);
  } catch (error) {
    console.error(`❌ Database connection failed:`, error.message);
  }

  // Start the EMQX/MQTT bridge (no-op unless MQTT_URL is set in backend/.env).
  startMqtt();
});