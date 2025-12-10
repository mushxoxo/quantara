"""
Main Orchestrator for Supply Chain Rerouting and Resilience Scoring System

This is the master file that coordinates all modules to:
1. Accept user parameters (weights, priorities, source, destination)
2. Get routes from Google Maps API (with fallback)
3. Extract route information (turns, distances, corners, etc.)
4. Gather weather, road, and risk data
5. Score routes using Gemini AI
6. Return ranked routes with resilience scores
"""

from typing import Dict, List, Optional, Tuple, Any
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ml_module.routes.google_maps_client import GoogleMapsClient
from ml_module.routes.fallback_routes import OpenRouteServiceClient
from ml_module.weather.weather_client import WeatherClient
from ml_module.road_data.road_analyzer import RoadAnalyzer
from ml_module.risk_analysis.political_risk import PoliticalRiskAnalyzer
from ml_module.resilience.gemini_scorer import GeminiResilienceScorer
from ml_module.utils.logger import setup_logger, get_logger

# Set up logging
logger = setup_logger("ml_module.main")


class SupplyChainReroutingSystem:
    """
    Main orchestrator for the supply chain rerouting system
    """
    
    def __init__(
        self,
        google_maps_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        openrouteservice_api_key: Optional[str] = None
    ):
        """
        Initialize the supply chain rerouting system.
        
        Args:
            google_maps_api_key: Google Maps API key (optional, can load from env)
            gemini_api_key: Gemini API key (optional, can load from env)
            openrouteservice_api_key: OpenRouteService API key for fallback
        """
        logger.info("Initializing Supply Chain Rerouting System")
        
        # Initialize clients
        self.google_maps_client = GoogleMapsClient(google_maps_api_key)
        self.fallback_routes_client = OpenRouteServiceClient(openrouteservice_api_key)
        self.weather_client = WeatherClient()
        self.road_analyzer = RoadAnalyzer()
        self.risk_analyzer = PoliticalRiskAnalyzer()
        self.gemini_scorer = GeminiResilienceScorer(gemini_api_key)
        
        logger.info("All modules initialized")
    
    def analyze_routes(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        user_priorities: Optional[Dict[str, float]] = None,
        origin_name: Optional[str] = None,
        destination_name: Optional[str] = None,
        max_alternatives: int = 3
    ) -> Dict[str, Any]:
        """
        Main function to analyze routes and return resilience scores.
        
        Args:
            origin: (latitude, longitude) of origin
            destination: (latitude, longitude) of destination
            user_priorities: Dictionary with user priorities/weights:
                - carbon_emission: Weight for carbon emission (0-1)
                - time: Weight for time (0-1)
                - distance: Weight for distance (0-1)
                - safety: Weight for safety (0-1)
            origin_name: Optional name of origin location
            destination_name: Optional name of destination location
            max_alternatives: Maximum number of alternative routes to analyze
        
        Returns:
            Dictionary with:
            - routes: List of analyzed routes with all data
            - resilience_scores: Gemini resilience scoring results
            - best_route: Best route recommendation
        """
        logger.info(f"Starting route analysis: {origin} -> {destination}")
        
        try:
            # Step 1: Get routes (try Google Maps, fallback to OpenRouteService)
            routes = self._get_routes(origin, destination, max_alternatives)
            
            if not routes:
                logger.error("No routes found. Cannot proceed with analysis.")
                return {
                    "error": "No routes found",
                    "routes": [],
                    "resilience_scores": None
                }
            
            logger.info(f"Found {len(routes)} route(s) to analyze")
            
            # Step 2: Enrich each route with additional data
            enriched_routes = []
            for i, route in enumerate(routes):
                logger.info(f"Enriching route {i+1}/{len(routes)}")
                enriched_route = self._enrich_route(
                    route,
                    origin,
                    destination,
                    i + 1,
                    origin_name,
                    destination_name
                )
                enriched_routes.append(enriched_route)
            
            # Step 3: Score routes using Gemini
            logger.info("Scoring routes with Gemini AI")
            resilience_scores = self.gemini_scorer.score_routes(
                enriched_routes,
                user_priorities
            )
            
            # Step 4: Combine results
            result = {
                "routes": enriched_routes,
                "resilience_scores": resilience_scores,
                "best_route": resilience_scores.get("best_route_name") if resilience_scores else None,
                "analysis_complete": True
            }
            
            logger.info("Route analysis completed successfully")
            return result
            
        except Exception as e:
            logger.error(f"Error in route analysis: {str(e)}", exc_info=True)
            return {
                "error": str(e),
                "routes": [],
                "resilience_scores": None,
                "analysis_complete": False
            }
    
    def _get_routes(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        max_alternatives: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Get routes from Google Maps API with fallback to OpenRouteService.
        
        Args:
            origin: (lat, lon) of origin
            destination: (lat, lon) of destination
            max_alternatives: Maximum number of alternative routes
        
        Returns:
            List of route dictionaries
        """
        # Try Google Maps first
        if self.google_maps_client.is_available():
            logger.info("Attempting to get routes from Google Maps API")
            routes = self.google_maps_client.get_directions(
                origin,
                destination,
                alternatives=True
            )
            
            if routes:
                logger.info(f"Successfully retrieved {len(routes)} routes from Google Maps")
                return routes[:max_alternatives]
            else:
                logger.warning("Google Maps API failed, trying fallback")
        
        # Fallback to OpenRouteService
        if self.fallback_routes_client.is_available():
            logger.info("Using OpenRouteService fallback")
            routes = self.fallback_routes_client.get_directions(
                origin,
                destination,
                alternatives=True
            )
            
            if routes:
                logger.info(f"Successfully retrieved {len(routes)} routes from OpenRouteService")
                return routes[:max_alternatives]
        
        logger.error("Both Google Maps and OpenRouteService failed")
        return []
    
    def _enrich_route(
        self,
        route: Dict[str, Any],
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        route_number: int,
        origin_name: Optional[str] = None,
        destination_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enrich a route with weather, road, and risk data.
        
        Args:
            route: Route dictionary from API
            origin: Origin coordinates
            destination: Destination coordinates
            route_number: Route number/ID
            origin_name: Optional origin name
            destination_name: Optional destination name
        
        Returns:
            Enriched route dictionary
        """
        route_name = route.get("summary", f"Route {route_number}")
        if not route_name or route_name == "":
            route_name = f"Route {route_number}"
        
        # Get coordinates for analysis
        coordinates = self._extract_coordinates(route)
        
        # Get weather data
        weather = self.weather_client.fetch_weather_along_route(
            coordinates,
            sample_points=5
        )
        
        # Get road types and analysis
        road_types = self.road_analyzer.get_road_types_along_route(
            origin,
            destination
        )
        road_width = self.road_analyzer.estimate_road_width(road_types)
        road_condition = self.road_analyzer.assess_road_condition(road_types, weather)
        rest_stops = self.road_analyzer.get_rest_stops_nearby(coordinates)
        
        # Get political/social risk
        risk_data = self.risk_analyzer.analyze_route_risk(
            origin_name or f"{origin[0]},{origin[1]}",
            destination_name or f"{destination[0]},{destination[1]}",
            route_name
        )
        
        # Calculate predicted duration (convert seconds to minutes)
        duration_min = route.get("duration_s", 0) / 60
        
        # Determine traffic status (simplified - can be enhanced)
        traffic_status = self._estimate_traffic_status(route, weather)
        
        enriched = {
            "route_name": route_name,
            "route_number": route_number,
            "distance_m": route.get("distance_m", 0),
            "distance_text": route.get("distance_text", ""),
            "duration_s": route.get("duration_s", 0),
            "duration_text": route.get("duration_text", ""),
            "predicted_duration_min": duration_min,
            "weather": weather,
            "road_types": road_types,
            "road_width": road_width,
            "road_condition": road_condition,
            "political_risk": risk_data.get("political_risk", 50.0),
            "social_risk": risk_data.get("social_risk", 50.0),
            "traffic_status": traffic_status,
            "rest_stops_nearby": rest_stops,
            "steps": route.get("steps", []),
            "coordinates": coordinates
        }
        
        return enriched
    
    def _extract_coordinates(self, route: Dict[str, Any]) -> List[Tuple[float, float]]:
        """
        Extract coordinates from route data.
        
        Args:
            route: Route dictionary
        
        Returns:
            List of (lat, lon) coordinate tuples
        """
        # Try different coordinate sources
        if "coordinates" in route:
            return route["coordinates"]
        
        # Extract from steps
        coordinates = []
        for step in route.get("steps", []):
            start = step.get("start_location", {})
            if start:
                coordinates.append((start.get("lat", 0), start.get("lng", 0)))
        
        # Add destination from last step
        if route.get("steps"):
            last_step = route["steps"][-1]
            end = last_step.get("end_location", {})
            if end:
                coordinates.append((end.get("lat", 0), end.get("lng", 0)))
        
        return coordinates if coordinates else []
    
    def _estimate_traffic_status(self, route: Dict[str, Any], weather: Dict[str, Any]) -> str:
        """
        Estimate traffic status based on route and weather data.
        
        Args:
            route: Route dictionary
            weather: Weather data dictionary
        
        Returns:
            Traffic status string: "low", "moderate", or "heavy"
        """
        # Simple heuristic based on duration and distance
        duration_s = route.get("duration_s", 0)
        distance_m = route.get("distance_m", 0)
        
        if distance_m == 0:
            return "moderate"
        
        # Calculate average speed (m/s)
        avg_speed_ms = distance_m / duration_s if duration_s > 0 else 0
        avg_speed_kmh = avg_speed_ms * 3.6
        
        # Adjust for weather
        if weather.get("rainfall_mm", 0) > 5:
            avg_speed_kmh *= 0.8  # Reduce speed estimate in rain
        
        # Classify traffic
        if avg_speed_kmh < 30:
            return "heavy"
        elif avg_speed_kmh < 50:
            return "moderate"
        else:
            return "low"


def main():
    """
    Example usage of the Supply Chain Rerouting System
    """
    # Example: Delhi to Gurgaon
    origin = (28.644800, 77.216721)  # Delhi
    destination = (28.459496, 77.029806)  # Gurgaon
    
    user_priorities = {
        "time": 0.4,
        "distance": 0.3,
        "safety": 0.2,
        "carbon_emission": 0.1
    }
    
    # Initialize system
    system = SupplyChainReroutingSystem()
    
    # Analyze routes
    result = system.analyze_routes(
        origin=origin,
        destination=destination,
        user_priorities=user_priorities,
        origin_name="Delhi",
        destination_name="Gurgaon"
    )
    
    # Print results
    print("\n" + "="*50)
    print("SUPPLY CHAIN ROUTE ANALYSIS RESULTS")
    print("="*50)
    
    if result.get("error"):
        print(f"Error: {result['error']}")
        return
    
    print(f"\nAnalyzed {len(result['routes'])} route(s)")
    
    if result.get("resilience_scores"):
        scores = result["resilience_scores"]
        print(f"\nBest Route: {scores.get('best_route_name')}")
        print(f"Reason: {scores.get('reason_for_selection')}")
        
        print("\nRoute Rankings:")
        for i, route_name in enumerate(scores.get("ranked_routes", []), 1):
            route_data = next(
                (r for r in scores.get("routes", []) if r["route_name"] == route_name),
                None
            )
            if route_data:
                print(f"{i}. {route_name}")
                print(f"   Resilience Score: {route_data['overall_resilience_score']}")
                print(f"   Weather Risk: {route_data['weather_risk_score']}")
                print(f"   Road Safety: {route_data['road_safety_score']}")
                print(f"   Social Risk: {route_data['social_risk_score']}")
                print(f"   Traffic Risk: {route_data['traffic_risk_score']}")
                print(f"   Summary: {route_data['short_summary']}")
                print()


if __name__ == "__main__":
    main()

