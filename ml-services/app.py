import os
import joblib
from flask import Flask, jsonify
from pymongo import MongoClient
from flask_cors import CORS 
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from pymongo import MongoClient
from dotenv import load_dotenv

from datetime import datetime, timedelta

load_dotenv()


app = Flask(__name__)
CORS(app)
MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

# ---------------- MongoDB Setup ----------------


MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["solar_scada"]
collection = db["scada_packets"]



print("🔍 Total documents in readings:", collection.count_documents({}))


# ------------- Get Latest Data ---------------


def get_latest_data(limit=96):

    data = list(collection.find().sort("timestamp", -1).limit(limit))

    df = pd.DataFrame(data)
    if "_id" in df.columns:
        df.drop(columns=["_id"], inplace=True)
    df = df.sort_values(by="timestamp")
    return df


# ------------- Train Models Automatically ---------------
def auto_train_models(df):
    # Anomaly
    try:
        X = df[["voltage_battery", "temperature", "motor_speed", "battery_percentage"]]
        iso = IsolationForest(contamination=0.05).fit(X)
        joblib.dump(iso, f"{MODEL_DIR}/anomaly_model.pkl")
    except Exception as e:
        print("Anomaly model training failed:", e)

    # Forecast
    try:
        X = df[["voltage_battery", "motor_speed"]]
        y = df["battery_percentage"]
        X_train, _, y_train, _ = train_test_split(X, y, test_size=0.2, random_state=42)
        reg = RandomForestRegressor().fit(X_train, y_train)
        joblib.dump(reg, f"{MODEL_DIR}/forecast_model.pkl")
    except Exception as e:
        print("Forecast model training failed:", e)

    # Risk
    try:
        X = df[["voltage_battery", "avg_current", "connectivity_status", "general_status"]]
        y = (df["error_code"] > 0).astype(int)
        X_train, _, y_train, _ = train_test_split(X, y, test_size=0.2, random_state=42)
        clf = LogisticRegression().fit(X_train, y_train)
        joblib.dump(clf, f"{MODEL_DIR}/risk_model.pkl")
    except Exception as e:
        print("Risk model training failed:", e)

# ------------- Ensure Models Trained ---------------
def ensure_models(df):
    if not all([
        os.path.exists(f"{MODEL_DIR}/anomaly_model.pkl"),
        os.path.exists(f"{MODEL_DIR}/forecast_model.pkl"),
        os.path.exists(f"{MODEL_DIR}/risk_model.pkl")
    ]):
        print("⚠️  Models not found. Training now...")
        auto_train_models(df)
    else:
        print("✅ All models already exist")
       

# ---------------- API Endpoints ----------------
@app.route("/")
def home():
    return "ML Flask Server is Running"
@app.route("/api/predict/anomaly", methods=["GET"])
def predict_anomaly():
    df = get_latest_data()
    ensure_models(df)
    model = joblib.load(f"{MODEL_DIR}/anomaly_model.pkl")
    X = df[["voltage_battery", "temperature", "motor_speed", "battery_percentage"]]
    df["is_anomaly"] = model.predict(X)
    return jsonify(df[["timestamp", "is_anomaly"]].to_dict(orient="records"))

@app.route("/api/predict/forecast", methods=["GET"])
def predict_forecast():
    df = get_latest_data()
    ensure_models(df)
    model = joblib.load(f"{MODEL_DIR}/forecast_model.pkl")
    last = df.iloc[-1]
    pred = model.predict([[last["voltage_battery"], last["motor_speed"]]])
    return jsonify({
        "timestamp": str(last["timestamp"]),
        "predicted_battery_pct": round(pred[0], 2)
    })

@app.route("/api/health", methods=["GET"])
def overall_health():
    df = get_latest_data(limit=288)  # ~24h if 5-min samples
    if df.empty:
        return jsonify({
            "status": "critical",
            "color": "red",
            "summary": "No data available",
            
            "last_seen": None,
            "metrics": {}
        }), 503

    last = df.iloc[-1]
    now = datetime.utcnow()
    last_ts = pd.to_datetime(last["timestamp"]).to_pydatetime() if "timestamp" in last else None

    # metrics used in summary
    battery = float(last.get("battery_percentage", 0))
    temp = float(last.get("temperature", 0))
    motor = float(last.get("motor_speed", 0))
    error_code = int(last.get("error_code", 0))
    connected = int(last.get("connectivity_status", 1))

    # baseline: motor high quantile for warning check
    try:
        motor_p95 = float(df["motor_speed"].quantile(0.95))
    except Exception:
        motor_p95 = 9999

    # freshness
    stale = True
    if last_ts:
        stale = (now - last_ts) > timedelta(minutes=30)

    # decide color
    status = "good"
    color = "green"
    summary = "System healthy"

    if stale or error_code > 0 or connected == 0 or battery < 15:
        status, color = "critical", "red"
        reasons = []
        if stale: reasons.append("data stale")
        if error_code > 0: reasons.append(f"error_code={error_code}")
        if connected == 0: reasons.append("disconnected")
        if battery < 15: reasons.append("low battery (<15%)")
        summary = " | ".join(reasons) or "critical"
    elif battery < 30 or temp > 60 or motor > motor_p95:
        status, color = "warning", "yellow"
        reasons = []
        if battery < 30: reasons.append("battery <30%")
        if temp > 60: reasons.append("high temperature")
        if motor > motor_p95: reasons.append("motor spike")
        summary = " | ".join(reasons) or "warning"

    return jsonify({
        "status": status,            # "good" | "warning" | "critical"
        "color": color,              # "green" | "yellow" | "red"
        "summary": summary,
        "last_seen": last_ts.isoformat() if last_ts else None,
        "metrics": {
            "battery_percentage": battery,
            "temperature": temp,
            "motor_speed": motor,
            "error_code": error_code,
            "connectivity_status": connected
        }
    })


    
# ---------------- Run Server ----------------
if __name__ == "__main__":
    print("🚀 Starting ML Flask Server...")
    df = get_latest_data()
    if len(df) >= 20:
        ensure_models(df)
    else:
        print("⚠️ Not enough data to train. Insert at least 20 records in MongoDB.")
    app.run(debug=True, port=8000)


#define connection of mongo db is active or not
@app.route("/mongo/health", methods=["GET"])
def health_check():
    try:
        # Ping MongoDB server
        server_status = mongo_client.admin.command("ping")
        return jsonify({"status": "✅ MongoDB Connected", "response": server_status}), 200
    except Exception as e:
        return jsonify({"status": "❌ MongoDB Not Connected", "error": str(e)}), 500

