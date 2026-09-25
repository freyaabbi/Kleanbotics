# services/weather_service.py - DYNAMIC location support
import requests
import os
from dotenv import load_dotenv
from typing import Dict, Optional
from datetime import datetime # <-- 1. ADD THIS IMPORT

load_dotenv()

class WeatherService:
    def __init__(self):
        self.default_lat = float(os.getenv('WEATHER_LAT', 28.6139))  # New Delhi
        self.default_lon = float(os.getenv('WEATHER_LON', 77.2090))
    
    def get_weather(self, lat: Optional[float] = None, lon: Optional[float] = None) -> Dict:
        """Dynamic location - uses provided coords OR env vars OR defaults"""
        lat = lat or float(os.getenv('WEATHER_LAT', self.default_lat))
        lon = lon or float(os.getenv('WEATHER_LON', self.default_lon))
        
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            'latitude': lat,
            'longitude': lon,
            'current_weather': 'true',
            'hourly': 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,shortwave_radiation',
            'timezone': 'auto',
            'forecast_days': 1
        }
        
        try:
            response = requests.get(url, params=params, timeout=5) # Lowered timeout so it fails faster behind the proxy
            data = response.json()
            current = data['current_weather']
            
            # Find the index corresponding to the current hour
            current_time_str = current.get('time', '')
            try:
                current_index = data['hourly']['time'].index(current_time_str)
            except (ValueError, KeyError):
                current_index = 0
            
            return {
                'location': f"{lat:.4f}°, {lon:.4f}°",
                'temperature': round(current['temperature'], 1),
                'windspeed': round(current['windspeed'], 1),
                'humidity': round(data['hourly']['relative_humidity_2m'][current_index], 1),
                'precipitation': data['hourly']['precipitation'][current_index],
                'solar_radiation': data['hourly']['shortwave_radiation'][current_index],
                'condition': self._get_condition(current['temperature'], data['hourly']['precipitation'][current_index]),
                'timestamp': data['hourly']['time'][current_index]
            }
        except Exception as e:
            # 2. DYNAMIC FALLBACK TIME: Keeps the UI timeline from breaking when the proxy blocks the API
            print(f"⚠️ Weather API blocked/failed. Using fallback. Reason: {e}")
            current_time = datetime.now().strftime('%Y-%m-%dT%H:%M')
            
            return {
                'location': f"{lat:.4f}°, {lon:.4f}°",
                'temperature': 35.2, 'windspeed': 8.3, 'humidity': 65,
                'precipitation': 0, 'solar_radiation': 650,
                'condition': 'clear', 
                'timestamp': current_time # <-- Applies the live time
            }
    
    def _get_condition(self, temp, precip):
        if temp > 45: return 'heatwave'
        if precip > 2: return 'rainy'
        if temp > 35: return 'hot'
        return 'clear'

# Global instance
weather = WeatherService()

def get_solar_farm_weather(lat=None, lon=None):
    return weather.get_weather(lat, lon)

def get_weather_by_city(city_coords):
    if isinstance(city_coords, str):
        city_map = {
            'mumbai': (19.0760, 72.8777),
            'bengaluru': (12.9716, 77.5946),
            'chennai': (13.0827, 80.2707)
        }
        coords = city_map.get(city_coords.lower())
        if coords:
            return weather.get_weather(*coords)
    elif isinstance(city_coords, dict):
        return weather.get_weather(city_coords['lat'], city_coords['lon'])
    return weather.get_weather()