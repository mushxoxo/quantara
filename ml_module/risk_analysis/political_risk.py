"""
Political and Social Risk Analysis
Web scraping and sentiment analysis for route risk assessment
"""

import requests
from typing import Dict, List, Optional, Tuple
from bs4 import BeautifulSoup
from ..utils.logger import get_logger

logger = get_logger(__name__)

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    logger.warning("Transformers not available. Sentiment analysis will use simple keyword matching.")


class PoliticalRiskAnalyzer:
    """
    Analyzer for political and social risks along routes
    """
    
    def __init__(self):
        """Initialize Political Risk Analyzer"""
        self.sentiment_analyzer = None
        if TRANSFORMERS_AVAILABLE:
            try:
                self.sentiment_analyzer = pipeline("sentiment-analysis")
                logger.info("Sentiment analysis model loaded")
            except Exception as e:
                logger.warning(f"Could not load sentiment analyzer: {str(e)}")
                self.sentiment_analyzer = None
    
    def analyze_route_risk(
        self,
        origin: str,
        destination: str,
        route_name: Optional[str] = None
    ) -> Dict[str, float]:
        """
        Analyze political and social risk for a route.
        
        Args:
            origin: Origin location name
            destination: Destination location name
            route_name: Optional route name/description
        
        Returns:
            Dictionary with risk scores:
            - political_risk: Risk score (0-100, higher = more risk)
            - social_risk: Social risk score (0-100)
            - overall_risk: Combined risk score
        """
        try:
            # Construct search query
            if route_name:
                query = f"{route_name} {origin} {destination} highway protest OR accident OR curfew OR rally OR strike"
            else:
                query = f"{origin} {destination} highway protest OR accident OR curfew OR rally OR strike"
            
            logger.info(f"Analyzing risk for route: {origin} -> {destination}")
            
            # Scrape news headlines
            headlines = self._scrape_news_headlines(query)
            
            if not headlines:
                logger.warning("No headlines found. Using default risk score.")

                ######## CAN ADJUST THIS LATER ########
                return {
                    "political_risk": 30.0,
                    "social_risk": 30.0,
                    "overall_risk": 30.0,
                    "headlines_analyzed": 0
                }
                ######## CAN ADJUST THIS LATER ########
            
            # Analyze sentiment
            negative_count = self._analyze_sentiment(headlines)
            
            # Calculate risk scores
            total_headlines = len(headlines)
            negative_ratio = negative_count / total_headlines if total_headlines > 0 else 0
            
            ######## CAN ADJUST THIS LATER ########
            political_risk = min(100, negative_ratio * 100)
            social_risk = political_risk * 0.9  # Slightly lower
            overall_risk = (political_risk + social_risk) / 2
            ######## CAN ADJUST THIS LATER ########
            
            result = {
                "political_risk": round(political_risk, 2),
                "social_risk": round(social_risk, 2),
                "overall_risk": round(overall_risk, 2),
                "headlines_analyzed": total_headlines,
                "negative_headlines": negative_count
            }
            
            logger.info(f"Risk analysis complete: Overall risk = {overall_risk:.1f}%")
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing route risk: {str(e)}", exc_info=True)
            return {
                "political_risk": 50.0,  # Default moderate risk
                "social_risk": 50.0,
                "overall_risk": 50.0,
                "headlines_analyzed": 0
            }
    
    def _scrape_news_headlines(self, query: str, max_results: int = 10) -> List[str]:
        """
        Scrape news headlines from Google News search.
        
        Args:
            query: Search query string
            max_results: Maximum number of headlines to retrieve
        
        Returns:
            List of headline strings
        """
        try:
            url = f"https://www.google.com/search?q={query}&tbm=nws"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
            
            logger.debug(f"Scraping news for query: {query}")
            response = requests.get(url, headers=headers, timeout=2)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Find headlines (Google News structure)
            headlines = []
            for h3 in soup.select("a h3"):
                headline_text = h3.get_text(strip=True)
                if headline_text:
                    headlines.append(headline_text)
            
            # Limit results
            headlines = headlines[:max_results]
            
            logger.debug(f"Found {len(headlines)} headlines")
            return headlines
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Network error scraping news: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Error scraping news headlines: {str(e)}", exc_info=True)
            return []
    
    def _analyze_sentiment(self, headlines: List[str]) -> int:
        """
        Analyze sentiment of headlines.
        
        Args:
            headlines: List of headline strings
        
        Returns:
            Number of negative headlines
        """
        if not headlines:
            return 0
        
        negative_count = 0
        
        if self.sentiment_analyzer:
            try:
                # Use transformer model
                results = self.sentiment_analyzer(headlines)
                for result in results:
                    if result.get("label") == "NEGATIVE":
                        negative_count += 1
            except Exception as e:
                logger.warning(f"Sentiment analysis error: {str(e)}. Using keyword matching.")
                negative_count = self._keyword_based_sentiment(headlines)
        else:
            # Fallback to keyword-based analysis
            negative_count = self._keyword_based_sentiment(headlines)
        
        return negative_count
    
    def _keyword_based_sentiment(self, headlines: List[str]) -> int:
        """
        Simple keyword-based sentiment analysis (fallback).
        
        Args:
            headlines: List of headline strings
        
        Returns:
            Number of negative headlines
        """
        negative_keywords = [
            "accident", "crash", "protest", "strike", "curfew", "violence",
            "killed", "injured", "fire", "explosion", "blocked", "closed",
            "danger", "risk", "emergency", "disaster", "chaos", "unrest"
        ]
        
        negative_count = 0
        for headline in headlines:
            headline_lower = headline.lower()
            if any(keyword in headline_lower for keyword in negative_keywords):
                negative_count += 1
        
        return negative_count
    
    def is_available(self) -> bool:
        """
        Check if risk analyzer is available.
        
        Returns:
            True (always available, uses fallback methods)
        """
        return True

