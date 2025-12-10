"""
Gemini-Powered Resilience Scorer
Uses Google Gemini AI to evaluate route resilience
"""

import json
import re
import time
from typing import List, Dict, Optional, Any
from ..config.api_keys import get_gemini_key
from ..utils.logger import get_logger

logger = get_logger(__name__)

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger.warning("google-generativeai not available. Install with: pip install google-generativeai")


class GeminiResilienceScorer:
    """
    Resilience scorer using Google Gemini AI
    """
    
    def __init__(self, api_key: Optional[str] = None, model_name: str = "models/gemini-2.5-flash"):
        """
        Initialize Gemini Resilience Scorer.
        
        Args:
            api_key: Gemini API key. If None, tries to load from environment.
            model_name: Gemini model name to use
        """
        self.api_key = api_key or get_gemini_key()
        self.model_name = model_name
        self.model = None
        
        if not GEMINI_AVAILABLE:
            logger.error("google-generativeai package not installed")
            return
        
        if not self.api_key:
            logger.warning("Gemini API key not found. Resilience scoring will fail.")
        else:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel(model_name)
                logger.info(f"Gemini model initialized: {model_name}")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini model: {str(e)}")
    
    def score_routes(
        self,
        routes_data: List[Dict[str, Any]],
        user_priorities: Optional[Dict[str, float]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Score multiple routes for resilience.
        
        Args:
            routes_data: List of route dictionaries with:
                - route_name: Name of the route
                - weather: Weather data dict
                - road_types: List of road types
                - political_risk: Political risk score
                - predicted_duration_min: Predicted duration in minutes
                - traffic_status: Traffic status string
                - rest_stops_nearby: Boolean
            user_priorities: Optional dictionary with user priorities/weights
        
        Returns:
            Dictionary with resilience scores and rankings, or None if failed
        """
        if not self.model:
            logger.error("Cannot score routes: Gemini model not initialized")
            return None
        
        try:
            prompt = self._build_prompt(routes_data, user_priorities)
            
            logger.info(f"Requesting resilience scores for {len(routes_data)} routes")
            
            # Retry logic
            max_retries = 3
            response_text = None
            
            for attempt in range(max_retries):
                try:
                    response = self.model.generate_content(prompt)
                    response_text = response.text
                    break
                except Exception as e:
                    logger.warning(f"Gemini API call failed (attempt {attempt + 1}/{max_retries}): {str(e)}")
                    if attempt < max_retries - 1:
                        time.sleep(1 + attempt * 2)
                    else:
                        raise
            
            if not response_text:
                logger.error("No response from Gemini API")
                return None
            
            # Parse JSON from response
            parsed = self._extract_json_from_text(response_text)
            
            if parsed is None:
                logger.error("Could not parse JSON from Gemini response")
                logger.debug(f"Raw response: {response_text[:500]}")
                return None
            
            # Validate and normalize scores
            validated = self._validate_scores(parsed, routes_data)
            
            logger.info("Resilience scoring completed successfully")
            return validated
            
        except Exception as e:
            logger.error(f"Error scoring routes: {str(e)}", exc_info=True)
            return None
    
    def _build_prompt(
        self,
        routes_data: List[Dict[str, Any]],
        user_priorities: Optional[Dict[str, float]] = None
    ) -> str:
        """
        Build the prompt for Gemini.
        
        Args:
            routes_data: List of route data dictionaries
            user_priorities: Optional user priorities
        
        Returns:
            Prompt string
        """
        priorities_text = ""
        if user_priorities:
            priorities_text = f"\n\nUser Priorities/Weights:\n{json.dumps(user_priorities, indent=2)}"
        
        prompt = f"""
You are an expert route resilience evaluator for logistics and supply chain management. You will be given multiple candidate routes with structured data.

For each route in the input list, analyze and compute these numeric scores (0-100 integers):
- weather_risk_score (higher means worse weather risk)
- road_safety_score (higher means safer road)
- social_risk_score (higher means more political/social disruption)
- traffic_risk_score (higher means worse traffic risk)
- overall_resilience_score (higher means more resilient; consider all factors, ETA, and user priorities)

Also produce:
- short_summary: one-line human-readable summary for each route
- reasoning: a short 1-2 sentence justification for each score

Finally:
- produce a ranked list of routes (highest overall_resilience_score first)
- provide best_route_name and reason_for_selection (1-2 lines)

Input data (JSON): {json.dumps(routes_data, indent=2)}{priorities_text}

Return **valid JSON only** in the following schema:
{{
  "routes": [
    {{
      "route_name": "Route A",
      "weather_risk_score": 0-100,
      "road_safety_score": 0-100,
      "social_risk_score": 0-100,
      "traffic_risk_score": 0-100,
      "overall_resilience_score": 0-100,
      "short_summary": "one-line summary",
      "reasoning": "one-line reason"
    }},
    ...
  ],
  "ranked_routes": ["RouteName1", "RouteName2", ...],
  "best_route_name": "RouteName1",
  "reason_for_selection": "one-line reason"
}}
Make sure the output is strictly valid JSON (no leading or trailing commentary).
"""
        return prompt
    
    def _extract_json_from_text(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Extract JSON from Gemini response text (robust parsing).
        
        Args:
            text: Response text from Gemini
        
        Returns:
            Parsed JSON dictionary or None if failed
        """
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Find first { ... } block
        start_idx = text.find('{')
        if start_idx == -1:
            logger.warning("No JSON object found in response")
            return None
        
        depth = 0
        json_text = None
        for i in range(start_idx, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    json_text = text[start_idx:i+1]
                    break
        
        if json_text:
            try:
                return json.loads(json_text)
            except json.JSONDecodeError:
                # Try cleaning common issues
                cleaned = json_text.replace("'", '"')  # Replace single quotes
                cleaned = re.sub(r',\s*}', '}', cleaned)  # Remove trailing commas
                cleaned = re.sub(r',\s*\]', ']', cleaned)
                try:
                    return json.loads(cleaned)
                except json.JSONDecodeError:
                    logger.warning("Could not parse JSON even after cleaning")
                    return None
        
        return None
    
    def _validate_scores(
        self,
        parsed: Dict[str, Any],
        routes_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Validate and normalize scores from Gemini response.
        
        Args:
            parsed: Parsed JSON from Gemini
            routes_data: Original routes data for validation
        
        Returns:
            Validated and normalized scores dictionary
        """
        def clamp_int(val: Any) -> int:
            """Clamp value to 0-100 integer"""
            try:
                v = int(round(float(val)))
            except (ValueError, TypeError):
                v = 50  # Default middle value
            return max(0, min(100, v))
        
        validated_routes = []
        for route in parsed.get("routes", []):
            validated_routes.append({
                "route_name": route.get("route_name", "Unknown Route"),
                "weather_risk_score": clamp_int(route.get("weather_risk_score", 50)),
                "road_safety_score": clamp_int(route.get("road_safety_score", 50)),
                "social_risk_score": clamp_int(route.get("social_risk_score", 50)),
                "traffic_risk_score": clamp_int(route.get("traffic_risk_score", 50)),
                "overall_resilience_score": clamp_int(route.get("overall_resilience_score", 50)),
                "short_summary": route.get("short_summary", "No summary available"),
                "reasoning": route.get("reasoning", "No reasoning provided")
            })
        
        # Ensure ranked routes exist
        ranked = parsed.get("ranked_routes", [])
        if not ranked:
            # Generate ranking from scores
            ranked = sorted(
                [r["route_name"] for r in validated_routes],
                key=lambda name: next(
                    (x["overall_resilience_score"] for x in validated_routes if x["route_name"] == name),
                    0
                ),
                reverse=True
            )
        
        best = parsed.get("best_route_name") or (ranked[0] if ranked else None)
        reason = parsed.get("reason_for_selection", "Selected based on overall resilience score")
        
        return {
            "routes": validated_routes,
            "ranked_routes": ranked,
            "best_route_name": best,
            "reason_for_selection": reason
        }
    
    def is_available(self) -> bool:
        """
        Check if Gemini scorer is available.
        
        Returns:
            True if model is initialized, False otherwise
        """
        return self.model is not None

