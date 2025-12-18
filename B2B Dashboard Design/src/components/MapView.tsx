import { Route } from "../App";
import * as React from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import polyline from "@mapbox/polyline"; // <-- Decode GraphHopper polyline

import {
  Navigation,
  AlertCircle,
  Cloud,
  Phone,
  Clock,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

// Fix leaflet icons
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  route: Route;
  isDarkMode?: boolean;
}

// Automatically re-center and fix map container issues
function MapController({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();

  React.useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);

  React.useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export function MapView({ route, isDarkMode = false }: MapViewProps) {
  const [originCoords, setOriginCoords] = React.useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = React.useState<[number, number] | null>(null);
  const [routePath, setRoutePath] = React.useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isGeminiOutputOpen, setIsGeminiOutputOpen] = React.useState(false);

  // ------------------------------
  // 1) Geocode City Name → Lat, Lon
  // ------------------------------
  const geocodeCity = async (city: string): Promise<[number, number] | null> => {
    try {
      const response = await axios.get(
        `http://localhost:5000/geocode?city=${encodeURIComponent(city)}`
      );

      if (response.data?.features?.length > 0) {
        const [lon, lat] = response.data.features[0].geometry.coordinates;
        return [lat, lon]; // convert to Leaflet order
      }
      return null;
    } catch (err: any) {
      console.error(`Geocoding error for ${city}:`, err);

      // Handle axios errors with status codes
      if (err.response) {
        const status = err.response.status;
        const errorMessage = err.response.data?.error || err.response.statusText || "Unknown error";

        if (status === 500) {
          console.error(`Server error while geocoding ${city}: ${errorMessage}`);
        } else if (status === 400) {
          console.error(`Invalid request for ${city}: ${errorMessage}`);
        }
      } else if (err.request) {
        console.error(`Network error while geocoding ${city}: Could not reach backend server`);
      }

      return null;
    }
  };

  // ------------------------------
  // 2) Fetch GraphHopper Route
  // ------------------------------
  const fetchRoute = async (coordinates: [number, number][]) => {
    try {
      const coordsString = coordinates
        .map((coord) => `${coord[1]},${coord[0]}`) // Leaflet [lat,lon] → GH [lon,lat]
        .join(";");

      const response = await axios.get("http://localhost:5000/route", {
        params: { coordinates: coordsString },
      });

      if (!response.data.paths || response.data.paths.length === 0) {
        throw new Error("No route found (GraphHopper)");
      }

      const encoded = response.data.paths[0].points;

      // Decode Google polyline → returns [lat, lon]
      const decoded = polyline.decode(encoded);

      // Convert to Leaflet format
      return decoded.map((points: [number, number]) => {
        const [lat, lon] = points;
        return [lat, lon] as [number, number];
      });
    } catch (err: any) {
      console.error("Route fetching error:", err);

      // Handle axios errors with status codes
      if (err.response) {
        const status = err.response.status;
        const errorMessage = err.response.data?.error || err.response.statusText || "Unknown error";

        if (status === 500) {
          throw new Error(`Server error: ${errorMessage}. Please check if the backend server is running and GraphHopper API key is configured.`);
        } else if (status === 400) {
          throw new Error(`Invalid request: ${errorMessage}`);
        } else {
          throw new Error(`Request failed (${status}): ${errorMessage}`);
        }
      } else if (err.request) {
        throw new Error("Network error: Could not reach the backend server. Please ensure the server is running on http://localhost:5000");
      } else {
        throw new Error(err.message || "Failed to fetch route");
      }
    }
  };

  // ------------------------------
  // 3) Load map, geocode cities, fetch route (only source and destination)
  // ------------------------------
  React.useEffect(() => {
    const loadMapData = async () => {
      setIsLoading(true);
      setError(null);
      setRoutePath([]);

      try {
        // Check if coordinates are already in route object (from backend)
        let origin: [number, number] | null = null;
        let dest: [number, number] | null = null;

        if ((route as any).coordinates?.origin && (route as any).coordinates?.destination) {
          // Use coordinates from backend
          origin = (route as any).coordinates.origin;
          dest = (route as any).coordinates.destination;
        } else {
          // Fallback to geocoding
          origin = await geocodeCity(route.origin);
          dest = await geocodeCity(route.destination);
        }

        if (origin && dest) {
          setOriginCoords(origin);
          setDestCoords(dest);

          // Only use source and destination - no waypoints
          const allCoords = [origin, dest];
          const path = await fetchRoute(allCoords);

          setRoutePath(path);
        } else {
          setError("Could not find coordinates for one or both cities.");
        }
      } catch (err: any) {
        console.error("Map loading error:", err);
        setError(err.message || "Routing service failed.");
      } finally {
        setIsLoading(false);
      }
    };

    loadMapData();
  }, [route]);

  const bounds: L.LatLngBoundsExpression | null =
    originCoords && destCoords ? [originCoords, destCoords] : null;

  // ------------------------------
  // 4) Render Component
  // ------------------------------

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col relative">
        <div className="flex-1 relative overflow-hidden z-0">
          {isLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-200/50 dark:bg-gray-800/50 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 animate-spin text-lime-500" />
              <span className="mt-2 text-gray-600 dark:text-gray-300">Calculating route...</span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-50 flex items-center justify-center">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-red-300">
                <AlertCircle className="text-red-600 w-5 h-5 mr-2 inline" />
                {error}
              </div>
            </div>
          )}

          <MapContainer
            center={[20.5937, 78.9629]} // India center
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            <MapController bounds={bounds} />

            {originCoords && (
              <Marker position={originCoords}>
                <Popup><strong>Origin:</strong> {route.origin}</Popup>
              </Marker>
            )}

            {destCoords && (
              <Marker position={destCoords}>
                <Popup><strong>Destination:</strong> {route.destination}</Popup>
              </Marker>
            )}

            {routePath.length > 0 && (
              <Polyline positions={routePath} color="#65a30d" weight={4} opacity={0.9} />
            )}
          </MapContainer>

          {/* Efficiency Score (using resilience score from ML module) */}
          <div className="absolute top-6 left-6 flex gap-3 z-[400]">
            <div className={`rounded-xl shadow-lg bg-white/90 dark:bg-gray-800/90 overflow-hidden transition-all ${isGeminiOutputOpen ? 'w-96' : 'w-auto'
              }`}>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-lime-600 dark:text-lime-400" />
                    <div>
                      <div className="text-xs text-gray-500">Efficiency Score</div>
                      <div className="text-lg font-semibold">{Math.round(route.resilienceScore * 10)}%</div>
                    </div>
                  </div>
                  {route.geminiOutput && (
                    <button
                      onClick={() => setIsGeminiOutputOpen(!isGeminiOutputOpen)}
                      className={`p-1.5 rounded-lg transition-colors ${isDarkMode
                          ? 'hover:bg-gray-700 text-gray-300'
                          : 'hover:bg-gray-100 text-gray-600'
                        }`}
                      title="View AI Analysis"
                    >
                      {isGeminiOutputOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Gemini Output Dropdown */}
              {isGeminiOutputOpen && route.geminiOutput && (
                <div className={`border-t px-4 py-4 max-h-96 overflow-y-auto ${isDarkMode ? 'border-gray-700' : 'border-gray-200'
                  }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                      AI Analysis Details
                    </h4>
                  </div>

                  {/* Summary */}
                  <div className="mb-4">
                    <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                      Summary
                    </div>
                    <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                      {route.geminiOutput.short_summary}
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div className="mb-4">
                    <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                      Reasoning
                    </div>
                    <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                      {route.geminiOutput.reasoning}
                    </div>
                  </div>

                  {/* Detailed Scores */}
                  <div>
                    <div className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                      Detailed Scores (0-100)
                    </div>
                    <div className="space-y-2">
                      {/* Weather Risk Score */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                            Weather Risk
                          </span>
                          <span className={`text-sm font-semibold ${route.geminiOutput.weather_risk_score > 70
                              ? 'text-red-500'
                              : route.geminiOutput.weather_risk_score > 40
                                ? 'text-yellow-500'
                                : 'text-green-500'
                            }`}>
                            {route.geminiOutput.weather_risk_score}
                          </span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                          <div
                            className={`h-full ${route.geminiOutput.weather_risk_score > 70
                                ? 'bg-red-500'
                                : route.geminiOutput.weather_risk_score > 40
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                            style={{ width: `${route.geminiOutput.weather_risk_score}%` }}
                          />
                        </div>
                      </div>

                      {/* Road Safety Score */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                            Road Safety
                          </span>
                          <span className={`text-sm font-semibold ${route.geminiOutput.road_safety_score > 70
                              ? 'text-green-500'
                              : route.geminiOutput.road_safety_score > 40
                                ? 'text-yellow-500'
                                : 'text-red-500'
                            }`}>
                            {route.geminiOutput.road_safety_score}
                          </span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                          <div
                            className={`h-full ${route.geminiOutput.road_safety_score > 70
                                ? 'bg-green-500'
                                : route.geminiOutput.road_safety_score > 40
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                            style={{ width: `${route.geminiOutput.road_safety_score}%` }}
                          />
                        </div>
                      </div>

                      {/* Carbon Emission Score */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                            Carbon Efficiency
                          </span>
                          <span className={`text-sm font-semibold ${(route.geminiOutput.carbon_score || 0) > 70
                              ? 'text-green-500'
                              : (route.geminiOutput.carbon_score || 0) > 40
                                ? 'text-yellow-500'
                                : 'text-red-500'
                            }`}>
                            {route.geminiOutput.carbon_score || 0}
                          </span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                          <div
                            className={`h-full ${(route.geminiOutput.carbon_score || 0) > 70
                                ? 'bg-green-500'
                                : (route.geminiOutput.carbon_score || 0) > 40
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                            style={{ width: `${route.geminiOutput.carbon_score || 0}%` }}
                          />
                        </div>
                      </div>

                      {/* Overall Resilience Score */}
                      <div className="pt-2 border-t border-gray-300 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                            Overall Resilience
                          </span>
                          <span className={`text-sm font-bold ${route.geminiOutput.overall_resilience_score > 70
                              ? 'text-lime-500'
                              : route.geminiOutput.overall_resilience_score > 40
                                ? 'text-yellow-500'
                                : 'text-red-500'
                            }`}>
                            {route.geminiOutput.overall_resilience_score}
                          </span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                          <div
                            className={`h-full ${route.geminiOutput.overall_resilience_score > 70
                                ? 'bg-lime-500'
                                : route.geminiOutput.overall_resilience_score > 40
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                            style={{ width: `${route.geminiOutput.overall_resilience_score}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Stats Bar – unchanged */}
        <div className="border-t px-8 py-5 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs text-gray-500">Route</div>
                <div>{route.origin} → {route.destination}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Distance</div>
                <div>{route.distance}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Estimated Time</div>
                <div>{route.time}</div>
              </div>
            </div>

            <button className="px-6 py-2.5 bg-lime-500 text-white rounded-lg">
              <Phone className="w-4 h-4 inline" /> Contact Logistics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
