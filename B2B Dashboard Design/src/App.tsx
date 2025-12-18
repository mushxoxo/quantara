import * as React from "react";
import { RouteList } from "./components/RouteList";
import { MapView } from "./components/MapView";
import { IntegrationsModal } from "./components/IntegrationsModal";
import { RouteSensitivityControls } from "./components/RouteSensitivityControls";
import { HighwayReliabilityPanel } from "./components/HighwayReliabilityPanel";
import { LiveNewsAlerts } from "./components/LiveNewsAlerts";
import { NewsPanel } from "./components/NewsPanel";
import { SelectionPage } from "./components/SelectionPage";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { useState } from "react";
import { Plug, Moon, Sun, GripVertical, GripHorizontal, Menu, X } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

export interface Route {
  id: string;
  origin: string;
  destination: string;
  resilienceScore: number;
  status: "Under Evaluation" | "Recommended" | "Flagged";
  time: string;
  cost: string;
  carbonEmission: string;
  disruptionRisk: "Low" | "Medium" | "High";
  distance: string;
  lastUpdated: string;
  courier: {
    name: string;
    avatar: string;
  };
  isRecommended: boolean;
  waypoints?: string[]; // Intermediate cities to force distinct paths
  coordinates?: {
    origin: [number, number];
    destination: [number, number];
  };
  geminiOutput?: {
    weather_risk_score: number;
    road_safety_score: number;
    carbon_score: number;
    social_risk_score: number;
    traffic_risk_score: number;
    overall_resilience_score: number;
    short_summary: string;
    reasoning: string;
  } | null;
}

const mockRoutes: Route[] = [
  {
    id: "1",
    origin: "Mumbai",
    destination: "Jaipur",
    resilienceScore: 9.5,
    status: "Recommended",
    time: "21 hrs",
    cost: "₹18,500",
    carbonEmission: "55 kg CO₂",
    disruptionRisk: "Low",
    distance: "1148 km",
    lastUpdated: "5 mins ago",
    waypoints: ["Surat", "Vadodara"],
    courier: {
      name: "Swift Transport",
      avatar: "ST",
    },
    isRecommended: true,
  },
  {
    id: "2",
    origin: "Mumbai",
    destination: "Jaipur",
    resilienceScore: 8.9,
    status: "Recommended",
    time: "23 hrs",
    cost: "₹16,200",
    carbonEmission: "52 kg CO₂",
    disruptionRisk: "Low",
    distance: "1160 km",
    lastUpdated: "15 mins ago",
    waypoints: ["Nashik", "Indore"],
    courier: {
      name: "Eco Logistics",
      avatar: "EL",
    },
    isRecommended: true,
  },
  {
    id: "3",
    origin: "Mumbai",
    destination: "Jaipur",
    resilienceScore: 8.2,
    status: "Under Evaluation",
    time: "25 hrs",
    cost: "₹15,000",
    carbonEmission: "58 kg CO₂",
    disruptionRisk: "Medium",
    distance: "1185 km",
    lastUpdated: "30 mins ago",
    waypoints: ["Ahmedabad", "Udaipur"],
    courier: {
      name: "Reliable Cargo",
      avatar: "RC",
    },
    isRecommended: false,
  },
  {
    id: "4",
    origin: "Mumbai",
    destination: "Jaipur",
    resilienceScore: 7.5,
    status: "Under Evaluation",
    time: "27 hrs",
    cost: "₹14,200",
    carbonEmission: "62 kg CO₂",
    disruptionRisk: "Medium",
    distance: "1210 km",
    lastUpdated: "1 hour ago",
    waypoints: ["Pune", "Aurangabad"],
    courier: {
      name: "Highway Kings",
      avatar: "HK",
    },
    isRecommended: false,
  },
  {
    id: "5",
    origin: "Mumbai",
    destination: "Jaipur",
    resilienceScore: 6.8,
    status: "Flagged",
    time: "32 hrs",
    cost: "₹12,800",
    carbonEmission: "75 kg CO₂",
    disruptionRisk: "High",
    distance: "1280 km",
    lastUpdated: "2 hours ago",
    waypoints: ["Bhavnagar", "Rajkot"],
    courier: {
      name: "Budget Movers",
      avatar: "BM",
    },
    isRecommended: false,
  },
];

export default function App() {
  const [view, setView] = useState<"selection" | "dashboard">("selection");
  const [routes, setRoutes] = useState<Route[]>([]); // Start empty - no dummy data
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [isIntegrationsOpen, setIsIntegrationsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<'stats' | 'news'>('news');
  const [priorities, setPriorities] = useState({ time: 25, distance: 25, safety: 25, carbonEmission: 25 });
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [sourceCity, setSourceCity] = useState<string>("");
  const [destCity, setDestCity] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState<string[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [osmnxEnabled, setOsmnxEnabled] = useState(false);

  const handleSelection = async (source: string, destination: string) => {
    console.log("=".repeat(60));
    console.log("FRONTEND: Route Selection Started");
    console.log("=".repeat(60));
    console.log(`Source: ${source}`);
    console.log(`Destination: ${destination}`);
    console.log(`Current Priorities:`, priorities);
    console.log(`OSMnx enabled: ${osmnxEnabled}`);

    // Clear previous routes and logs
    setRoutes([]);
    setSelectedRoute(null);
    setLoadingLogs([]);
    setLoadingProgress(0);

    setSourceCity(source);
    setDestCity(destination);
    setIsLoadingRoutes(true);
    setView("dashboard");

    // Add initial log
    setLoadingLogs(prev => [...prev, `Analyzing routes from ${source} to ${destination}...`]);
    setLoadingProgress(10);

    try {
      const requestBody = {
        source,
        destination,
        priorities: {
          time: priorities.time,
          distance: priorities.distance,
          safety: priorities.safety,
          carbonEmission: priorities.carbonEmission
        },
        osmnxEnabled
      };

      console.log("FRONTEND: Calling backend API /analyze-routes");
      console.log("Request body:", JSON.stringify(requestBody, null, 2));

      setLoadingLogs(prev => [...prev, "Geocoding locations...", "Fetching routes from Google Maps..."]);
      setLoadingProgress(30);

      // Call backend API to analyze routes
      const response = await fetch("http://localhost:5000/analyze-routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`FRONTEND: Response status: ${response.status} ${response.statusText}`);
      setLoadingLogs(prev => [...prev, "Analyzing routes with AI...", "Calculating resilience scores..."]);
      setLoadingProgress(70);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FRONTEND: API error response:", errorText);
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("FRONTEND: Received data from backend");
      console.log(`Number of routes: ${data.routes?.length || 0}`);
      console.log(`Best route: ${data.bestRoute || "N/A"}`);
      console.log(`Analysis complete: ${data.analysisComplete}`);

      if (data.routes && data.routes.length > 0) {
        const recommendedCount = data.routes.filter((r: Route) => r.resilienceScore > 8).length;
        console.log(`Recommended routes (score > 8): ${recommendedCount}`);
        console.log("Route details:");
        data.routes.forEach((route: Route, index: number) => {
          const routeName = (route as any).route_name || route.courier.name || route.id;
          console.log(`  ${index + 1}. ${routeName} - Score: ${route.resilienceScore.toFixed(2)}/10 - Status: ${route.status}`);
        });

        setLoadingLogs(prev => [...prev, `Found ${data.routes.length} route(s)`, `Recommended: ${recommendedCount} route(s)`]);
        setLoadingProgress(90);

        setRoutes(data.routes);
        setSelectedRoute(data.routes[0]);
        setLoadingLogs(prev => [...prev, "✓ Analysis complete!"]);
        setLoadingProgress(100);
        console.log("FRONTEND: Routes updated successfully");
      } else {
        console.warn("FRONTEND: No routes returned");
        setLoadingLogs(prev => [...prev, "⚠ No routes found. Please try different locations."]);
        setRoutes([]);
        setSelectedRoute(null);
      }
    } catch (error) {
      console.error("FRONTEND: Error fetching routes:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      setLoadingLogs(prev => [...prev, `✗ Error: ${error instanceof Error ? error.message : String(error)}`]);
      setRoutes([]);
      setSelectedRoute(null);
    } finally {
      setTimeout(() => {
        setIsLoadingRoutes(false);
        setLoadingProgress(0);
        setLoadingLogs([]);
      }, 1000); // Keep loading state for 1 second to show completion
      console.log("FRONTEND: Route selection process completed");
      console.log("=".repeat(60));
    }
  };

  const handlePrioritiesChange = (newPriorities: { time: number; distance: number; safety: number; carbonEmission: number }) => {
    console.log("FRONTEND: Priorities changed (UI only, not recalculating)");
    console.log("New priorities:", newPriorities);

    // Just update the state - don't trigger recalculation
    setPriorities(newPriorities);
  };

  const handleRecalculate = async (newPriorities: { time: number; distance: number; safety: number; carbonEmission: number }) => {
    console.log("FRONTEND: Recalculate button clicked");
    console.log("Priorities for recalculation:", newPriorities);

    // Re-score routes with new priorities if we have source/destination
    // Use /rescore-routes endpoint (only Gemini, no Google Maps)
    if (sourceCity && destCity) {
      console.log("FRONTEND: Re-scoring routes with new priorities (Gemini only)");
      setIsLoadingRoutes(true);
      setLoadingLogs(prev => [...prev, "Re-scoring routes with updated priorities...", "Running AI analysis..."]);
      setLoadingProgress(50);

      try {
        const requestBody = {
          source: sourceCity,
          destination: destCity,
          priorities: {
            time: newPriorities.time,
            distance: newPriorities.distance,
            safety: newPriorities.safety,
            carbonEmission: newPriorities.carbonEmission
          }
        };

        console.log("FRONTEND: Calling /rescore-routes endpoint (Gemini only, no Google Maps)");
        console.log("Request body:", JSON.stringify(requestBody, null, 2));

        const response = await fetch("http://localhost:5000/rescore-routes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        console.log(`FRONTEND: Response status: ${response.status} ${response.statusText}`);
        setLoadingProgress(80);

        if (response.ok) {
          const data = await response.json();
          console.log(`FRONTEND: Received ${data.routes?.length || 0} re-scored routes`);

          if (data.routes && data.routes.length > 0) {
            const recommendedCount = data.routes.filter((r: Route) => r.resilienceScore > 8).length;
            console.log(`Recommended routes (score > 8): ${recommendedCount}`);
            console.log("Route efficiency scores:");
            data.routes.forEach((route: Route, index: number) => {
              const routeName = (route as any).route_name || route.courier.name || route.id;
              console.log(`  ${index + 1}. ${routeName} - Efficiency: ${(route.resilienceScore * 10).toFixed(1)}% - Status: ${route.status}`);
            });

            setLoadingLogs(prev => [...prev, `Found ${data.routes.length} route(s)`, `Recommended: ${recommendedCount} route(s)`]);
            setLoadingProgress(95);

            setRoutes(data.routes);
            // Keep the same selected route if it still exists
            if (selectedRoute) {
              const currentRouteId = selectedRoute.id;
              const newSelectedRoute = data.routes.find((r: Route) => r.id === currentRouteId) || data.routes[0];
              setSelectedRoute(newSelectedRoute);
              console.log(`FRONTEND: Routes updated, selected route: ${newSelectedRoute.id}`);
            } else {
              setSelectedRoute(data.routes[0]);
            }

            setLoadingLogs(prev => [...prev, "✓ Recalculation complete!"]);
            setLoadingProgress(100);
          }
        } else {
          const errorText = await response.text();
          console.error("FRONTEND: API error response:", errorText);
          setLoadingLogs(prev => [...prev, `✗ Error: ${errorText}`]);
        }
      } catch (error) {
        console.error("FRONTEND: Error re-scoring routes:", error);
        console.error("Error details:", error instanceof Error ? error.message : String(error));
        setLoadingLogs(prev => [...prev, `✗ Error: ${error instanceof Error ? error.message : String(error)}`]);
      } finally {
        setTimeout(() => {
          setIsLoadingRoutes(false);
          setLoadingProgress(0);
          setLoadingLogs([]);
        }, 1000);
        console.log("FRONTEND: Re-scoring completed");
      }
    } else {
      console.log("FRONTEND: No source/destination set, skipping re-scoring");
    }
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  if (view === "selection") {
    return (
      <SelectionPage
        onContinue={handleSelection}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        osmnxEnabled={osmnxEnabled}
        onToggleOsmnx={setOsmnxEnabled}
      />
    );
  }

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={isLoadingRoutes}
        progress={loadingProgress}
        logs={loadingLogs}
        isDarkMode={isDarkMode}
      />

      {/* Header */}
      {/* Floating Hamburger Menu */}
      <div className="fixed top-4 right-6 z-50 flex flex-col items-end">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`p-2 rounded-full shadow-lg transition-transform hover:scale-105 ${isDarkMode ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-700'
            }`}
        >
          {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className={`mt-2 p-2 rounded-xl shadow-xl border flex flex-col gap-2 ${isDarkMode
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-200'
            }`}>
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isDarkMode
                ? 'hover:bg-gray-700 text-sm font-medium text-gray-200'
                : 'hover:bg-gray-50 text-sm font-medium text-gray-700'
                }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-gray-600'
                }`}>
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </div>
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              onClick={() => {
                setView("selection");
                setIsMenuOpen(false);
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isDarkMode
                ? 'hover:bg-gray-700 text-sm font-medium text-gray-200'
                : 'hover:bg-gray-50 text-sm font-medium text-gray-700'
                }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-gray-700 text-lime-400' : 'bg-gray-100 text-lime-600'
                }`}>
                <Plug className="w-4 h-4" />
              </div>
              <span>Change Route</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content - Resizable Panels */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar - Route Cards */}
          <Panel defaultSize={25} minSize={20} maxSize={40} className={`border-r ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
            }`}>
            <div className="h-full overflow-y-auto">
              {routes.length > 0 && selectedRoute ? (
                <RouteList
                  routes={routes}
                  selectedRoute={selectedRoute}
                  onSelectRoute={setSelectedRoute}
                  isDarkMode={isDarkMode}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <p className="text-lg mb-2">No routes available</p>
                    <p className="text-sm">Select origin and destination to analyze routes</p>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <PanelResizeHandle className={`w-1 hover:bg-lime-500 transition-colors flex items-center justify-center ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
            }`}>
            <GripVertical className="w-3 h-3 text-gray-400" />
          </PanelResizeHandle>

          {/* Center + Right Area */}
          <Panel>
            <div className="h-full flex flex-col">
              {/* Top Panel - Sensitivity Controls (Fixed Height) */}
              <div className={`shrink-0 border-b px-6 py-6 ${isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
                }`}>
                <div className="flex justify-end mb-2">
                  <label
                    className="flex items-center gap-2 text-xs cursor-pointer"
                    title="Enabling this option will increase accuracy but also increase the processing time"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-400"
                      checked={osmnxEnabled}
                      onChange={(e) => setOsmnxEnabled(e.target.checked)}
                    />
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                      Use detailed road data (OSMnx)
                    </span>
                  </label>
                </div>
                <RouteSensitivityControls
                  isDarkMode={isDarkMode}
                  onPrioritiesChange={handlePrioritiesChange}
                  onRecalculate={handleRecalculate}
                  disabled={routes.length === 0 || isLoadingRoutes}
                  isRecalculating={isLoadingRoutes}
                />
              </div>

              {/* Bottom Panel - Map + Right Sidebar */}
              <div className="flex-1 overflow-hidden">
                <PanelGroup direction="horizontal">
                  {/* Map View */}
                  <Panel defaultSize={75} minSize={50}>
                    {selectedRoute ? (
                      <MapView route={selectedRoute} isDarkMode={isDarkMode} />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <p className="text-lg mb-2">No route selected</p>
                          <p className="text-sm">Select a route from the list to view on map</p>
                        </div>
                      </div>
                    )}
                  </Panel>

                  <PanelResizeHandle className={`w-1 hover:bg-lime-500 transition-colors flex items-center justify-center ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                    <GripVertical className="w-3 h-3 text-gray-400" />
                  </PanelResizeHandle>

                  {/* Right Sidebar */}
                  <Panel defaultSize={25} minSize={20} maxSize={40} className={`border-l ${isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
                    }`}>
                    <div className="h-full flex flex-col">
                      <div className={`p-4 border-b shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`flex p-1 rounded-full border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`}>
                          <button
                            onClick={() => setActiveRightTab('news')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all ${activeRightTab === 'news'
                              ? isDarkMode ? 'bg-lime-500 text-gray-900 shadow' : 'bg-lime-500 text-white shadow'
                              : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                              }`}
                          >
                            Latest News
                          </button>
                          <button
                            onClick={() => setActiveRightTab('stats')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all ${activeRightTab === 'stats'
                              ? isDarkMode ? 'bg-lime-500 text-gray-900 shadow' : 'bg-white text-gray-900 shadow'
                              : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                              }`}
                          >
                            Stats & Alerts
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {activeRightTab === 'news' ? (
                          <NewsPanel
                            cities={Array.from(new Set(
                              routes.flatMap(r => [r.origin, r.destination, ...(r.waypoints || [])])
                            ))}
                            isDarkMode={isDarkMode}
                          />
                        ) : (
                          <>
                            <HighwayReliabilityPanel isDarkMode={isDarkMode} />
                            <LiveNewsAlerts isDarkMode={isDarkMode} />
                          </>
                        )}
                      </div>
                    </div>
                  </Panel>
                </PanelGroup>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Integrations Modal */}
      <IntegrationsModal
        isOpen={isIntegrationsOpen}
        onClose={() => setIsIntegrationsOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}