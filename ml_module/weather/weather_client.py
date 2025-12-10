"""
Weather Data Client
Uses Open-Meteo API (free, no key required)
"""

import requests
from typing import Dict, Optional, Tuple
import numpy as np
from ..utils.logger import get_logger

logger = get_logger(__name__)


class WeatherClient:
    """
    Client for fetching weather data using Open-Meteo API
    """
    
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    
    def __init__(self):
        """Initialize Weather Client (no API key needed for Open-Meteo)"""
        pass
    
    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        timezone: str = "UTC"
    ) -> Dict[str, float]:
        """
        Fetch current weather conditions for a location.
        
        Args:
            latitude: Latitude of the location
            longitude: Longitude of the location
            timezone: Timezone string (default: UTC)
        
        Returns:
            Dictionary with weather metrics:
            - rainfall_mm: Rainfall in millimeters
            - visibility_m: Visibility in meters
            - windspeed: Wind speed (m/s)
            - temperature: Temperature in Celsius (optional)
            - cloudcover: Cloud cover percentage (optional)
        """
        try:
            url = self.BASE_URL
            params = {
                "latitude": latitude,
                "longitude": longitude,
                "hourly": "precipitation,cloudcover,windspeed_10m,temperature_2m",
                "current_weather": "true",
                "timezone": timezone
            }
            
            logger.debug(f"Fetching weather for location ({latitude}, {longitude})")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            current_weather = data.get("current_weather", {})
            hourly = data.get("hourly", {})
            
            # Get current hour index
            current_time = current_weather.get("time", "")
            times = hourly.get("time", [])
            
            # Extract current values
            windspeed = current_weather.get("windspeed", 0.0)
            temperature = current_weather.get("temperature", 0.0)
            
            # Get precipitation for current hour
            precipitations = hourly.get("precipitation", [0.0])
            rainfall_mm = precipitations[0] if precipitations else 0.0
            
            # Get cloud cover
            cloudcovers = hourly.get("cloudcover", [0])
            cloudcover = cloudcovers[0] if cloudcovers else 0
            
            # Estimate visibility based on weather conditions
            # Higher wind/rain = lower visibility
            visibility_m = max(100, 10000 - (windspeed * 100) - (rainfall_mm * 50))
            
            result = {
                "rainfall_mm": float(rainfall_mm),
                "visibility_m": float(visibility_m),
                "windspeed": float(windspeed),
                "temperature": float(temperature),
                "cloudcover": int(cloudcover)
            }
            
            logger.debug(f"Weather data retrieved: {result}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Network error fetching weather: {str(e)}. Using default values.")
            return self._get_default_weather()
        except Exception as e:
            logger.error(f"Unexpected error fetching weather: {str(e)}", exc_info=True)
            return self._get_default_weather()
    
    def fetch_weather_along_route(
        self,
        coordinates: list,
        sample_points: int = 5
    ) -> Dict[str, any]:
        """
        Fetch weather data for multiple points along a route.
        
        Args:
            coordinates: List of [lat, lon] or [lon, lat] coordinate pairs
            sample_points: Number of points to sample along the route
        
        Returns:
            Dictionary with aggregated weather data
        """
        if not coordinates:
            return self._get_default_weather()
        
        # Sample points along the route
        if len(coordinates) > sample_points:
            step = len(coordinates) // sample_points
            sampled = [coordinates[i] for i in range(0, len(coordinates), step)][:sample_points]
        else:
            sampled = coordinates
        
        weather_data = []
        for coord in sampled:
            # Handle both [lat, lon] and [lon, lat] formats
            if len(coord) >= 2:
                lat, lon = coord[0], coord[1]
                # If longitude is likely first (abs > 90), swap
                if abs(lon) > 90:
                    lat, lon = lon, lat
                weather = self.fetch_weather(lat, lon)
                weather_data.append(weather)
        
        if not weather_data:
            return self._get_default_weather()
        
        # Aggregate weather data (average)
        aggregated = {
            "rainfall_mm": np.mean([w["rainfall_mm"] for w in weather_data]),
            "visibility_m": np.mean([w["visibility_m"] for w in weather_data]),
            "windspeed": np.mean([w["windspeed"] for w in weather_data]),
            "temperature": np.mean([w.get("temperature", 0) for w in weather_data]),
            "cloudcover": int(np.mean([w.get("cloudcover", 0) for w in weather_data]))
        }
        
        logger.info(f"Aggregated weather for {len(sampled)} points along route")
        return aggregated
    
    def _get_default_weather(self) -> Dict[str, float]:
        """
        Return default weather values when API fails.
        
        Returns:
            Dictionary with default weather values
        """
        return {
            "rainfall_mm": 0.0,
            "visibility_m": 10000.0,
            "windspeed": 0.0,
            "temperature": 20.0,
            "cloudcover": 0
        }
    
    def is_available(self) -> bool:
        """
        Check if weather API is available (always True for Open-Meteo).
        
        Returns:
            True (Open-Meteo doesn't require API key)
        """
        return True

