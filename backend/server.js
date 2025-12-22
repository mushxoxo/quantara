import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import mongoose from "mongoose";
import RecommendedRoute from "./models/RecommendedRoute.js";
//import CoveredPoint from "./models/CoveredPoints.js";
//import { simulateRouteMovement } from "./utils/simulation.js";
import simulateRoute from "../ml_module/utils/simulation.js";
import polyline from "@mapbox/polyline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (one level up from backend)
const rootEnvPath = path.join(__dirname, "..", ".env");
const backendEnvPath = path.join(__dirname, ".env");

// Try to load from root first, then backend directory
if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
    console.log(`Loaded .env from: ${rootEnvPath}`);
} else if (fs.existsSync(backendEnvPath)) {
    dotenv.config({ path: backendEnvPath });
    console.log(`Loaded .env from: ${backendEnvPath}`);
} else {
    dotenv.config(); // Default behavior
    console.log("Warning: No .env file found. Using default dotenv behavior.");
}

//MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));


const app = express();
app.use(cors());
app.use(express.json());

const GH_KEY = process.env.GH_KEY;

// Debug: Check if GH_KEY is loaded
if (GH_KEY) {
    console.log(`GH_KEY loaded successfully (${GH_KEY.substring(0, 8)}...)`);
} else {
    console.log("WARNING: GH_KEY not found in environment variables!");
    console.log("Please ensure .env file exists with GH_KEY=your_graphhopper_key");
}

// Cache for storing routes (so we don't re-fetch when priorities change)
const routeCache = new Map();

// -----------------------------
// Logging Setup
// -----------------------------
const logDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, "backend.log");

function log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    // Console output
    console.log(logMessage);

    // File output
    fs.appendFileSync(logFile, logMessage + "\n", "utf8");
}

// Request logging middleware
app.use((req, res, next) => {
    log(`${req.method} ${req.path} - IP: ${req.ip}`);
    if (req.body && Object.keys(req.body).length > 0) {
        log(`Request body: ${JSON.stringify(req.body).substring(0, 200)}...`);
    }

    next();
});

// -----------------------------
// Root endpoint
// -----------------------------
app.get("/", (req, res) => {
    log("Root endpoint accessed");
    res.json({
        message: "B2B Dashboard Backend API - Formula-Based Scoring",
        version: "2.0.0",
        endpoints: {
            "GET /geocode": "Geocode city name to coordinates",
            "GET /route": "Get route between coordinates (GraphHopper)",
            "POST /analyze-routes": "Analyze routes using ML module (calls Google Maps + full analysis)",
            "POST /rescore-routes": "Re-score routes with new priorities (cached data, no API calls)"
        },
        features: [
            "Mathematical formula-based scoring",
            "Time, distance, carbon, and road quality analysis",
            "Weather integration via Open-Meteo",
            "Road type analysis via OSMnx",
            "Route caching for fast priority updates"
        ]
    });
});

// -----------------------------
// 🟢 Geocoding (Photon – FREE)
// -----------------------------
app.get("/geocode", async (req, res) => {
    const { city } = req.query;

    log(`=== GEOCODING ===`);
    log(`Request: ${city}`);

    if (!city) {
        log("Geocoding failed: City parameter missing", "ERROR");
        return res.status(400).json({ error: "City required" });
    }

    try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=1`;
        log(`Photon API call: ${url}`);

        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const [lon, lat] = data.features[0].geometry.coordinates;
            log(`Result: (${lat}, ${lon})`);
        } else {
            log(`No results for ${city}`, "WARN");
        }

        return res.json(data);
    } catch (err) {
        log(`Geocoding error: ${err.message}`, "ERROR");
        return res.status(500).json({ error: "Geocoding failed" });
    }
});

// -----------------------------
// 🟦 Routing (GraphHopper)
// -----------------------------
app.get("/route", async (req, res) => {
    const { coordinates } = req.query;

    log(`=== GRAPHHOPPER ROUTING ===`);
    log(`Coordinates: ${coordinates}`);

    if (!coordinates) {
        log("Route request failed: Missing coordinates parameter", "ERROR");
        return res.status(400).json({ error: "Missing coordinates parameter" });
    }

    if (!GH_KEY) {
        log("Route request failed: Missing GH_KEY in .env", "ERROR");
        return res.status(500).json({
            error: "Missing GH_KEY in .env",
            details: "Please add GH_KEY=your_graphhopper_api_key to your .env file in the backend directory"
        });
    }

    // Convert "lon,lat" → "lat,lon" because GraphHopper expects lat-first
    const points = coordinates
        .split(";")
        .map(c => {
            const [lon, lat] = c.split(",");
            return `${lat},${lon}`;
        });

    log(`Converted ${points.length} coordinate points`);

    const ghURL =
        `https://graphhopper.com/api/1/route?vehicle=car&locale=en&key=${GH_KEY}` +
        points.map(p => `&point=${p}`).join("");

    log(`GraphHopper request URL: ${ghURL.substring(0, 100)}...`);

    try {
        const response = await fetch(ghURL);
        const data = await response.json();

        if (!response.ok) {
            log(`GraphHopper error: ${JSON.stringify(data)}`, "ERROR");

            // Provide more specific error messages
            let errorMessage = "Routing failed";
            if (data.message) {
                errorMessage = data.message;
            } else if (data.error) {
                errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            } else if (response.status === 401 || response.status === 403) {
                errorMessage = "Invalid or missing GraphHopper API key. Please check your GH_KEY in .env";
            } else if (response.status === 429) {
                errorMessage = "GraphHopper API rate limit exceeded. Please try again later.";
            }

            return res.status(response.status >= 400 && response.status < 500 ? response.status : 500).json({
                error: errorMessage,
                details: data
            });
        }

        log(`GraphHopper route retrieved successfully`);
        return res.json(data);
    } catch (err) {
        log(`GraphHopper exception: ${err.message}`, "ERROR");
        log(`Stack trace: ${err.stack}`, "ERROR");
        return res.status(500).json({
            error: "Routing failed",
            details: err.message || "Unknown error occurred while fetching route from GraphHopper"
        });
    }
});

// -----------------------------
// 🧠 ML Route Analysis (Full Analysis)
// -----------------------------
app.post("/analyze-routes", async (req, res) => {
    log("=" * 60);
    log("=== FULL ROUTE ANALYSIS REQUEST ===");
    log("=" * 60);

    const { source, destination, priorities, osmnxEnabled } = req.body;

    log(`Source: ${source}`);
    log(`Destination: ${destination}`);
    log(`Priorities: ${JSON.stringify(priorities)}`);
    if (typeof osmnxEnabled === "boolean") {
        log(`OSMnx enabled (from frontend): ${osmnxEnabled}`);
    }

    if (!source || !destination) {
        log("Analysis failed: Source and destination required", "ERROR");
        return res.status(400).json({ error: "Source and destination required" });
    }

    try {
        // Step 1: Geocode source and destination
        log("\n→ GEOCODING");
        log(`Geocoding source: ${source}...`);
        const sourceGeo = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(source)}&limit=1`);
        const sourceData = await sourceGeo.json();

        log(`Geocoding destination: ${destination}...`);
        const destGeo = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(destination)}&limit=1`);
        const destData = await destGeo.json();

        if (!sourceData.features || sourceData.features.length === 0) {
            log(`Geocoding failed for source: ${source}`, "ERROR");
            return res.status(400).json({ error: `Could not geocode source: ${source}` });
        }
        if (!destData.features || destData.features.length === 0) {
            log(`Geocoding failed for destination: ${destination}`, "ERROR");
            return res.status(400).json({ error: `Could not geocode destination: ${destination}` });
        }

        // Photon returns [lon, lat]
        const [sourceLon, sourceLat] = sourceData.features[0].geometry.coordinates;
        const [destLon, destLat] = destData.features[0].geometry.coordinates;

        log(`✓ Source: ${source} -> (${sourceLat}, ${sourceLon})`);
        log(`✓ Destination: ${destination} -> (${destLat}, ${destLon})`);

        // Step 2: Prepare user priorities (normalize to 0-1 range)
        const userPriorities = {
            time: (priorities?.time || 25) / 100,
            distance: (priorities?.distance || 25) / 100,
            carbon_emission: (priorities?.carbonEmission || 25) / 100,
            road_quality: (priorities?.safety || 25) / 100  // Map 'safety' to 'road_quality'
        };

        log(`Normalized priorities: ${JSON.stringify(userPriorities)}`);

        // Step 3: Call Python ML module
        log("\n→ ML MODULE CALL");
        const pythonScript = path.resolve(__dirname, "..", "ml_module", "run_analysis.py");
        log(`Python script: ${pythonScript}`);

        const inputData = JSON.stringify({
            source_lat: sourceLat,
            source_lon: sourceLon,
            dest_lat: destLat,
            dest_lon: destLon,
            source_name: source,
            dest_name: destination,
            priorities: userPriorities,
            osmnx_enabled: typeof osmnxEnabled === "boolean" ? osmnxEnabled : undefined
        });

        log(`Input data size: ${inputData.length} bytes`);
        log(`Spawning Python process...`);

        const pythonProcess = spawn(`python "${pythonScript}"`, [], {
            cwd: path.join(__dirname, ".."),
            shell: true
        });

        let stdout = "";
        let stderr = "";

        pythonProcess.stdin.write(inputData);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on("data", (data) => {
            const chunk = data.toString();
            stdout += chunk;
            process.stdout.write(`[PYTHON] ${chunk}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderr += chunk;
            process.stderr.write(`[PYTHON ERROR] ${chunk}`);
        });

        pythonProcess.on("close", async (code) => {
            log(`Python process exited with code: ${code}`);

            if (code !== 0) {
                log(`Python error (code ${code}): ${stderr}`, "ERROR");
                return res.status(500).json({
                    error: "ML analysis failed",
                    details: stderr
                });
            }

            try {
                // Parse JSON output from Python
                log("\n→ RESPONSE TRANSFORMATION");
                const lines = stdout.trim().split("\n");
                let jsonLine = "";

                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith("{")) {
                        jsonLine = lines.slice(i).join("\n");
                        break;
                    }
                }

                if (!jsonLine) {
                    log("No JSON found in Python output", "ERROR");
                    throw new Error("No JSON found in Python output");
                }

                const result = JSON.parse(jsonLine);
                log("✓ JSON parsed successfully");

                if (result.error) {
                    log(`ML module error: ${result.error}`, "ERROR");
                    return res.status(500).json({ error: result.error });
                }

                // Transform ML output to frontend format
                const resilience_scores = result.resilience_scores || {};
                const scoredRoutes = resilience_scores.routes || [];

                log(`Routes received: ${result.routes?.length || 0}`);
                log(`Resilience scores: ${scoredRoutes.length}`);

                const routes = result.routes?.map((route, index) => {
                    const routeName = route.route_name || `Route ${index + 1}`;
                    const scoreData = scoredRoutes.find(r => r.route_name === routeName) || {};

                    // Fallback to route object itself which is enriched, fixing 0 score issue
                    const resilienceScore100 = route.overall_resilience_score || scoreData.overall_resilience_score || 0;
                    const resilienceScore = resilienceScore100 / 10;  // Convert to 0-10 scale

                    let status = "Under Evaluation";
                    if (resilienceScore > 8) {
                        status = "Recommended";
                    } else if (resilienceScore < 6) {
                        status = "Flagged";
                    }

                    const weatherRisk = route.avg_weather_risk || 0;
                    let disruptionRisk = "Low";
                    if (weatherRisk > 0.7) {
                        disruptionRisk = "High";
                    } else if (weatherRisk > 0.4) {
                        disruptionRisk = "Medium";
                    }

                    const durationMin = route.predicted_duration_min || 0;
                    const timeText = durationMin >= 60
                        ? `${Math.round(durationMin / 60)} hrs`
                        : `${Math.round(durationMin)} mins`;

                    const distanceKm = Math.round(route.distance_m / 1000);
                    const distanceText = `${distanceKm} km`;

                    const costPerKm = 15;
                    const cost = Math.round(distanceKm * costPerKm);
                    const costText = `₹${cost.toLocaleString()}`;

                    const carbonKg = route.total_carbon_kg || 0;
                    const carbonText = `${Math.round(carbonKg)} kg CO₂`;

                    // Generate summary and reasoning for frontend
                    const componentScores = route.component_scores || scoreData.component_scores || {};
                    const shortSummary = `Route ${weatherRisk > 0.7 ? 'has high' : 'has moderate'} weather risk. Total distance: ${distanceText}.`;
                    const reasoning = `Time: ${(componentScores.time_score || 0).toFixed(2)}, Distance: ${(componentScores.distance_score || 0).toFixed(2)}, Carbon: ${(componentScores.carbon_score || 0).toFixed(2)}, Road: ${(componentScores.road_quality_score || 0).toFixed(2)}`;

                    // Gemini Output mapping (passed from Python or fallbacks)
                    const geminiAnalysis = route.gemini_analysis || {};
                    const intermediateCities = Array.isArray(geminiAnalysis.intermediate_cities)
    ? geminiAnalysis.intermediate_cities.slice(0, 2)
    : [];

                    const geminiOutput = {
                        weather_risk_score: Math.round(geminiAnalysis.weather_risk_score || weatherRisk * 100),
                        road_safety_score: Math.round(geminiAnalysis.road_safety_score || (route.road_safety_score || 0.5) * 100),
                        // Now using Carbon Score instead of risks
                        carbon_score: Math.round(geminiAnalysis.carbon_score || (route.carbon_score || 0) * 100),
                        social_risk_score: 0, // Keeping for backward compatibility if needed, but UI uses carbon
                        traffic_risk_score: 0,

                        overall_resilience_score: Math.round(geminiAnalysis.overall_resilience_score || resilienceScore100),
                        short_summary: geminiAnalysis.short_summary || shortSummary,
                        reasoning: geminiAnalysis.reasoning || reasoning,
                        intermediate_cities: intermediateCities
                    };

                    return {
                        id: String(index + 1),
                        origin: source,
                        destination: destination,
                        resilienceScore: resilienceScore,
                        status: status,
                        time: timeText,
                        cost: costText,
                        carbonEmission: carbonText,
                        disruptionRisk: disruptionRisk,
                        distance: distanceText,
                        lastUpdated: "Just now",
                        courier: {
                            // Use creative name from Gemini if available
                            name: geminiAnalysis.route_name || routeName,
                            avatar: (geminiAnalysis.route_name || routeName).substring(0, 2).toUpperCase()
                        },
                        isRecommended: resilienceScore > 8,
                        coordinates: {
                            origin: [sourceLat, sourceLon],
                            destination: [destLat, destLon]
                        },
                        overview_polyline: route.overview_polyline,
                        analysisData: geminiOutput, // Legacy support
                        geminiOutput: geminiOutput,  // New Frontend field
                        intermediate_cities: intermediateCities
                    };
                }) || [];
               
                
                log(`Transformed ${routes.length} routes for frontend`);
                log(`Recommended routes (score > 8): ${routes.filter(r => r.resilienceScore > 8).length}`);
// ===============================
// SAVE BEST ROUTE + START SIMULATION
// ===============================
console.log("🔥 SAVING BEST ROUTE TO DB");

const bestRoute = routes.find(r => r.isRecommended);

if (!bestRoute) {
    console.warn("⚠️ No recommended route found");
} else {

    const decodedCoordinates = polyline
        .decode(bestRoute.overview_polyline)
        .map(([lat, lng]) => ({ lat, lng }));

    const savedRoute = await RecommendedRoute.create({
        ml_route_id: bestRoute.id,
        route_name: bestRoute.courier.name,

        source,
        destination,

        overview_polyline: bestRoute.overview_polyline,
        decoded_coordinates: decodedCoordinates,

        intermediate_cities: bestRoute.intermediate_cities
    });

    console.log("🚀 STARTING SIMULATION");
    simulateRoute(savedRoute).catch(console.error);
}

                // Cache routes for re-scoring
                const cacheKey = `${source}_${destination}`;
                routeCache.set(cacheKey, {
                    routes: result.routes,
                    source,
                    destination,
                    coordinates: { origin: [sourceLat, sourceLon], destination: [destLat, destLon] }
                });
                log(`✓ Cached routes for ${cacheKey}`);

                log("=" * 60);
                log("=== ROUTE ANALYSIS COMPLETE ===");
                log("=" * 60);

                res.json({
                    routes: routes,
                    bestRoute: result.best_route,
                    analysisComplete: result.analysis_complete
                });

            } catch (parseError) {
                log(`Parse error: ${parseError.message}`, "ERROR");
                return res.status(500).json({
                    error: "Failed to parse ML results",
                    details: parseError.message
                });
            }
        });

    } catch (err) {
        log(`Route analysis error: ${err.message}`, "ERROR");
        log(`Stack: ${err.stack}`, "ERROR");
        return res.status(500).json({ error: "Route analysis failed", details: err.message });
    }
});

// -----------------------------
// 🔄 Re-score Routes (Only Resilience Calculation)
// -----------------------------
app.post("/rescore-routes", async (req, res) => {
    log("=" * 60);
    log("=== RE-SCORING REQUEST ===");
    log("=" * 60);

    const { source, destination, priorities } = req.body;

    log(`Source: ${source}`);
    log(`Destination: ${destination}`);
    log(`New priorities: ${JSON.stringify(priorities)}`);

    if (!source || !destination) {
        log("Re-scoring failed: Source and destination required", "ERROR");
        return res.status(400).json({ error: "Source and destination required" });
    }

    const cacheKey = `${source}_${destination}`;
    const cached = routeCache.get(cacheKey);

    if (!cached) {
        log("Re-scoring failed: No cached routes found", "ERROR");
        return res.status(400).json({
            error: "No routes found. Please select source and destination first."
        });
    }

    try {
        const userPriorities = {
            time: (priorities?.time || 25) / 100,
            distance: (priorities?.distance || 25) / 100,
            carbon_emission: (priorities?.carbonEmission || 25) / 100,
            road_quality: (priorities?.safety || 25) / 100
        };

        log(`Normalized priorities: ${JSON.stringify(userPriorities)}`);
        log(`Using cached routes (${cached.routes.length} routes)`);

        log("\n→ ML MODULE CALL (rescore only)");
        const pythonScript = path.resolve(__dirname, "..", "ml_module", "rescore_routes.py");
        log(`Python script: ${pythonScript}`);

        const inputData = JSON.stringify({
            routes_data: cached.routes,
            priorities: userPriorities
        });

        log(`Input data size: ${inputData.length} bytes`);

        const pythonProcess = spawn(`python "${pythonScript}"`, [], {
            cwd: path.join(__dirname, ".."),
            shell: true
        });

        let stdout = "";
        let stderr = "";

        pythonProcess.stdin.write(inputData);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on("data", (data) => {
            const chunk = data.toString();
            stdout += chunk;
            process.stdout.write(`[PYTHON] ${chunk}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderr += chunk;
            process.stderr.write(`[PYTHON ERROR] ${chunk}`);
        });

        pythonProcess.on("close", async (code) => {
            log(`Python process exited with code: ${code}`);

            if (code !== 0) {
                log(`Python error (code ${code}): ${stderr}`, "ERROR");
                return res.status(500).json({
                    error: "Re-scoring failed",
                    details: stderr
                });
            }

            try {
                const lines = stdout.trim().split("\n");
                let jsonLine = "";

                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith("{")) {
                        jsonLine = lines.slice(i).join("\n");
                        break;
                    }
                }

                if (!jsonLine) {
                    log("No JSON found in Python output", "ERROR");
                    throw new Error("No JSON found in Python output");
                }

                const result = JSON.parse(jsonLine);
                log("✓ JSON parsed successfully");

                if (result.error) {
                    log(`Re-scoring error: ${result.error}`, "ERROR");
                    return res.status(500).json({ error: result.error });
                }
//const bestRouteName = result.best_route;

// ⚠️ IMPORTANT: use ML routes, not frontend routes
console.log("🔥 SAVING BEST ROUTE TO DB");

const bestRoute = routes.find(r => r.isRecommended);

if (!bestRoute) {
    console.warn("⚠️ No recommended route found");
} else {

    const decodedCoordinates = polyline
        .decode(bestRoute.overview_polyline)
        .map(([lat, lng]) => ({ lat, lng }));

    const savedRoute = await RecommendedRoute.create({
        ml_route_id: bestRoute.id,
        route_name: bestRoute.courier.name,

        source,
        destination,

        overview_polyline: bestRoute.overview_polyline,
        decoded_coordinates: decodedCoordinates,

        intermediate_cities: bestRoute.intermediate_cities
    });

    console.log("🚀 STARTING SIMULATION");
    simulateRoute(savedRoute).catch(console.error);
}


                const resilience_scores = result.resilience_scores || {};
                const scoredRoutes = resilience_scores.routes || [];

                const routes = result.routes?.map((route, index) => {
                    const routeName = route.route_name || `Route ${index + 1}`;
                    const scoreData = scoredRoutes.find(r => r.route_name === routeName) || {};

                    // Fallback to route object itself which is enriched, fixing 0 score issue
                    const resilienceScore100 = route.overall_resilience_score || scoreData.overall_resilience_score || 0;
                    const resilienceScore = resilienceScore100 / 10;

                    let status = "Under Evaluation";
                    if (resilienceScore > 8) status = "Recommended";
                    else if (resilienceScore < 6) status = "Flagged";

                    const weatherRisk = route.avg_weather_risk || 0;
                    let disruptionRisk = "Low";
                    if (weatherRisk > 0.7) disruptionRisk = "High";
                    else if (weatherRisk > 0.4) disruptionRisk = "Medium";

                    const durationMin = route.predicted_duration_min || 0;
                    const timeText = durationMin >= 60
                        ? `${Math.round(durationMin / 60)} hrs`
                        : `${Math.round(durationMin)} mins`;

                    const distanceKm = Math.round(route.distance_m / 1000);
                    const distanceText = `${distanceKm} km`;
                    const costPerKm = 15;
                    const cost = Math.round(distanceKm * costPerKm);
                    const costText = `₹${cost.toLocaleString()}`;
                    const carbonKg = route.total_carbon_kg || 0;
                    const carbonText = `${Math.round(carbonKg)} kg CO₂`;

                    const componentScores = route.component_scores || scoreData.component_scores || {};
                    const shortSummary = `Route ${weatherRisk > 0.7 ? 'has high' : 'has moderate'} weather risk. Total distance: ${distanceText}.`;
                    const reasoning = `Time: ${(componentScores.time_score || 0).toFixed(2)}, Distance: ${(componentScores.distance_score || 0).toFixed(2)}, Carbon: ${(componentScores.carbon_score || 0).toFixed(2)}, Road: ${(componentScores.road_quality_score || 0).toFixed(2)}`;

                    // Gemini Output mapping (passed from Python or fallbacks)
                    const geminiAnalysis = route.gemini_analysis || {};
                    const intermediateCities =
    Array.isArray(geminiAnalysis.intermediate_cities)
        ? geminiAnalysis.intermediate_cities.slice(0, 2) // limit to 2
        : [];
                    const geminiOutput = {
                        weather_risk_score: Math.round(geminiAnalysis.weather_risk_score || weatherRisk * 100),
                        road_safety_score: Math.round(geminiAnalysis.road_safety_score || (route.road_safety_score || 0.5) * 100),
                        // Now using Carbon Score instead of risks
                        carbon_score: Math.round(geminiAnalysis.carbon_score || (route.carbon_score || 0) * 100),
                        social_risk_score: 0, // Keeping for backward compatibility if needed, but UI uses carbon
                        traffic_risk_score: 0,

                        overall_resilience_score: Math.round(geminiAnalysis.overall_resilience_score || resilienceScore100),
                        short_summary: geminiAnalysis.short_summary || shortSummary,
                        reasoning: geminiAnalysis.reasoning || reasoning,
                        intermediate_cities: intermediateCities
                    };

                    return {
                        id: String(index + 1),
                        origin: source,
                        destination: destination,
                        resilienceScore: resilienceScore,
                        status: status,
                        time: timeText,
                        cost: costText,
                        carbonEmission: carbonText,
                        disruptionRisk: disruptionRisk,
                        distance: distanceText,
                        lastUpdated: "Just now",
                        courier: {
                            // Use creative name from Gemini if available
                            name: geminiAnalysis.route_name || routeName,
                            avatar: (geminiAnalysis.route_name || routeName).substring(0, 2).toUpperCase()
                        },
                        isRecommended: resilienceScore > 8,
                        coordinates: cached.coordinates,
                        overview_polyline: route.overview_polyline,
                        analysisData: geminiOutput, // Legacy support
                        geminiOutput: geminiOutput,  // New Frontend field
                        intermediateCities: intermediateCities
                    };
                }) || [];

                log(`Re-scored ${routes.length} routes`);
                log(`Recommended routes (score > 8): ${routes.filter(r => r.resilienceScore > 8).length}`);

                log("=" * 60);
                log("=== RE-SCORING COMPLETE ===");
                log("=" * 60);

                res.json({
                    routes: routes,
                    // Using route info if best_route_name matches none in resilience_scores
                    bestRoute: resilience_scores.best_route_name,
                    analysisComplete: true
                });

            } catch (parseError) {
                log(`Parse error: ${parseError.message}`, "ERROR");
                return res.status(500).json({
                    error: "Failed to parse re-scoring results",
                    details: parseError.message
                });
            }
        });

    } catch (err) {
        log(`Re-scoring error: ${err.message}`, "ERROR");
        return res.status(500).json({ error: "Re-scoring failed", details: err.message });
    }
});

// -----------------------------
// Start Server
// -----------------------------
const PORT = 5000;
app.listen(PORT, () => {
    const startupMessage = `Backend server started on http://localhost:${PORT}`;
    console.log(startupMessage);
    log(startupMessage);
    log("Backend API v2.0 - Formula-Based Scoring");
    log("Endpoints:");
    log("  GET  / - API information");
    log("  GET  /geocode?city=<name> - Geocode city");
    log("  GET  /route?coordinates=<coords> - Get route");
    log("  POST /analyze-routes - Full route analysis");
    log("  POST /rescore-routes - Priority-based re-scoring");
    log("=" * 60);
});
