"""
Gemini Route Summary Generator

Uses Google Gemini API to generate natural language summaries, 
creative route names, and intermediate city extraction for analyzed routes.
"""

import json
import os
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from ..utils.logger import get_logger
from ..config.api_keys import get_gemini_key

logger = get_logger("ml_module.analysis.gemini_summary")

def generate_summary(routes_data: List[Dict[str, Any]], 
                    overall_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate summaries and extract cities using Gemini.

    Args:
        routes_data: List of enriched route dictionaries with scores
        overall_context: Context about origin, destination, and priorities

    Returns:
        Dictionary with route_name keys mapped to analysis objects:
        {
            "Route 1": {
                "route_name": "The Scenic Highway",
                "short_summary": "Fastest but high weather risk...",
                "reasoning": "High resilience score due to...",
                "intermediate_cities": [
                    {"name": "Pune", "lat": 18.52, "lon": 73.85},
                    ...
                ]
            },
            ...
        }
    """
    api_key = get_gemini_key()
    if not api_key:
        logger.error("Gemini API key not found. Skipping summary generation.")
        return {}

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-flash-latest')
        
        # Prepare simple context for Gemini
        routes_context = []
        for route in routes_data:
            # Safely get scores, defaulting to 0 if missing
            resilience = route.get('overall_resilience_score', 0)
            
            # Extract component scores if available
            comp_scores = route.get('component_scores', {})
            weather_risk = route.get('avg_weather_risk', 0)
            safety_score = route.get('road_safety_score', 0.5)
            carbon_score = route.get('carbon_score', 0)
            
            summary_obj = {
                "id": route.get("route_name", "Unknown"),
                "total_distance": route.get("distance_text", "Unknown"),
                "total_time": route.get("duration_text", "Unknown"),
                "scores": {
                    "overall_resilience": resilience,
                    "weather_risk": weather_risk,
                    "road_safety": safety_score,
                    "carbon_efficiency": carbon_score
                },
                # Provide a sample of coordinates for city extraction context
                # Taking every 50th point to keep prompt size manageable but give path context
                "path_sample": route.get("coordinates", [])[::50] if route.get("coordinates") else []
            }
            routes_context.append(summary_obj)

        prompt = f"""
        You are a Logistics Analysis Expert. Analyze these supply chain routes from {overall_context.get('origin', 'Origin')} to {overall_context.get('destination', 'Destination')}.

        Routes Data:
        {json.dumps(routes_context, indent=2)}

        Task:
        1. Give each route a unique, creative, professional name based on its characteristics (e.g., "The Coastal Expressway", "The Industrial Corridor").
        2. Write a 1-sentence 'short_summary' highlighting the key trade-off (e.g., "Fastest route but high weather risk").
        3. Write a 'reasoning' paragraph explaining why it got its resilience score.
        4. Identify 3-5 major intermediate cities/towns along the route based on the path samples and general geography. Return their approx latitude/longitude if possible, otherwise Estimate.

        Output strictly valid JSON in this format:
        {{
            "Route 1": {{
                "route_name": "Name",
                "short_summary": "Summary",
                "reasoning": "Reasoning",
                "intermediate_cities": [
                    {{"name": "CityName", "lat": 0.0, "lon": 0.0}}
                ]
            }},
            ... (for all routes)
        }}
        """

        logger.info("Sending request to Gemini...")
        response = model.generate_content(prompt)
        
        # Parse JSON from response
        text = response.text
        # Clean up code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
            
        result = json.loads(text.strip())
        logger.info("Successfully generated Gemini summaries")
        return result

    except Exception as e:
        logger.error(f"Error generating Gemini summary: {str(e)}")
        return {}
