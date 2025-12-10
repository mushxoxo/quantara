"""
Road Data Analyzer
Uses OSMnx to extract road network information
"""

from typing import List, Dict, Optional, Tuple, Any
import networkx as nx
from ..utils.logger import get_logger

logger = get_logger(__name__)

try:
    import osmnx as ox
    OSMNX_AVAILABLE = True
except ImportError:
    OSMNX_AVAILABLE = False
    logger.warning("OSMnx not available. Road analysis features will be limited.")


class RoadAnalyzer:
    """
    Analyzer for road network data using OSMnx
    """
    
    def __init__(self):
        """Initialize Road Analyzer"""
        if not OSMNX_AVAILABLE:
            logger.warning("OSMnx not installed. Install with: pip install osmnx")
    
    def get_road_types_along_route(
        self,
        start_point: Tuple[float, float],
        end_point: Tuple[float, float],
        distance_m: int = 20000
    ) -> List[str]:
        """
        Get road types along a route between two points.
        
        Args:
            start_point: (latitude, longitude) of start
            end_point: (latitude, longitude) of end
            distance_m: Distance in meters to search for road network
        
        Returns:
            List of road type strings (e.g., ['motorway', 'trunk', 'secondary'])
        """
        if not OSMNX_AVAILABLE:
            logger.warning("OSMnx not available. Returning default road types.")
            return ["secondary", "tertiary"]  # Default fallback
        
        try:
            # Get graph for drivable roads around start point
            logger.debug(f"Fetching road network around {start_point}")
            G = ox.graph_from_point(
                start_point,
                dist=distance_m,
                network_type='drive'
            )
            
            # Find nearest nodes
            start_node = ox.nearest_nodes(G, start_point[1], start_point[0])  # lon, lat
            end_node = ox.nearest_nodes(G, end_point[1], end_point[0])
            
            # Get shortest path
            route = nx.shortest_path(G, start_node, end_node, weight='length')
            
            # Extract road types
            road_types = []
            for u, v in zip(route[:-1], route[1:]):
                if G.has_edge(u, v):
                    edge_data = G[u][v][0]  # Get first edge data
                    highway = edge_data.get('highway', 'unknown')
                    if isinstance(highway, list):
                        highway = highway[0]  # Take first if list
                    road_types.append(str(highway))
            
            logger.info(f"Extracted {len(road_types)} road segments")
            return road_types if road_types else ["secondary"]  # Fallback
            
        except Exception as e:
            logger.error(f"Error analyzing road types: {str(e)}", exc_info=True)
            return ["secondary"]  # Default fallback
    
    def estimate_road_width(self, road_types: List[str]) -> Dict[str, Any]:
        """
        Estimate road width based on road types.
        
        Args:
            road_types: List of road type strings
        
        Returns:
            Dictionary with width estimates and statistics
        """
        # Road width estimates (in meters) based on OSM highway types
        width_mapping = {
            'motorway': 12.0,
            'motorway_link': 10.0,
            'trunk': 11.0,
            'trunk_link': 9.0,
            'primary': 9.0,
            'primary_link': 7.0,
            'secondary': 7.0,
            'secondary_link': 6.0,
            'tertiary': 6.0,
            'tertiary_link': 5.0,
            'residential': 4.0,
            'service': 3.0,
            'unclassified': 4.0,
            'unknown': 5.0
        }
        
        widths = []
        for road_type in road_types:
            # Handle road types with suffixes (e.g., 'primary_link' -> 'primary')
            base_type = road_type.split('_')[0] if '_' in road_type else road_type
            width = width_mapping.get(road_type, width_mapping.get(base_type, 5.0))
            widths.append(width)
        
        if not widths:
            widths = [5.0]  # Default
        
        return {
            "average_width_m": sum(widths) / len(widths),
            "min_width_m": min(widths),
            "max_width_m": max(widths),
            "road_types": road_types,
            "width_distribution": {rt: widths.count(width_mapping.get(rt, 5.0)) for rt in set(road_types)}
        }
    
    def assess_road_condition(
        self,
        road_types: List[str],
        weather: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Assess road condition based on road types and weather.
        
        Args:
            road_types: List of road type strings
            weather: Optional weather data dictionary
        
        Returns:
            Dictionary with road condition assessment
        """
        # Road quality scores (0-100, higher is better)
        quality_scores = {
            'motorway': 90,
            'trunk': 85,
            'primary': 80,
            'secondary': 70,
            'tertiary': 60,
            'residential': 50,
            'service': 40,
            'unclassified': 45
        }
        
        scores = []
        for road_type in road_types:
            base_type = road_type.split('_')[0] if '_' in road_type else road_type
            score = quality_scores.get(road_type, quality_scores.get(base_type, 50))
            scores.append(score)
        
        avg_score = sum(scores) / len(scores) if scores else 50
        
        # Adjust for weather conditions
        if weather:
            rainfall = weather.get("rainfall_mm", 0)
            if rainfall > 10:
                avg_score -= 10
            elif rainfall > 5:
                avg_score -= 5
            
            visibility = weather.get("visibility_m", 10000)
            if visibility < 1000:
                avg_score -= 15
            elif visibility < 5000:
                avg_score -= 5
        
        avg_score = max(0, min(100, avg_score))  # Clamp to 0-100
        
        return {
            "condition_score": int(avg_score),
            "condition_text": self._score_to_text(avg_score),
            "primary_road_types": list(set(road_types))[:3],  # Top 3 unique types
            "weather_impact": weather is not None
        }
    
    def _score_to_text(self, score: float) -> str:
        """Convert numeric score to text description"""
        if score >= 80:
            return "excellent"
        elif score >= 60:
            return "good"
        elif score >= 40:
            return "fair"
        else:
            return "poor"
    
    def get_rest_stops_nearby(
        self,
        coordinates: List[Tuple[float, float]],
        search_radius_m: int = 5000
    ) -> bool:
        """
        Check if there are rest stops nearby along the route.
        
        Args:
            coordinates: List of (lat, lon) coordinate pairs
            search_radius_m: Search radius in meters
        
        Returns:
            True if rest stops are likely available, False otherwise
        """
        # Simplified check: major roads (motorway, trunk, primary) typically have rest stops
        # In a full implementation, this would query OSM for amenities
        if not coordinates:
            return False
        
        # For now, return True if route is long enough (likely to have rest stops)
        # In production, this should query OSM for actual amenities
        return len(coordinates) > 10  # Simplified heuristic
    
    def is_available(self) -> bool:
        """
        Check if road analyzer is available.
        
        Returns:
            True if OSMnx is available, False otherwise
        """
        return OSMNX_AVAILABLE

