import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GH_KEY = process.env.GH_KEY;

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
        message: "B2B Dashboard Backend API",
        version: "1.0.0",
        endpoints: {
            "GET /geocode": "Geocode city name to coordinates",
            "GET /route": "Get route between coordinates",
            "POST /analyze-routes": "Analyze routes using ML module (calls Google Maps)",
            "POST /rescore-routes": "Re-score routes with new priorities (only Gemini, no Google Maps)"
        }
    });
});

// -----------------------------
// 🟢 Geocoding (Photon – FREE)
// -----------------------------
app.get("/geocode", async (req, res) => {
    const { city } = req.query;

    log(`Geocoding request for city: ${city}`);

    if (!city) {
        log("Geocoding failed: City parameter missing", "ERROR");
        return res.status(400).json({ error: "City required" });
    }

    try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=1`;
        log(`Geocoding URL: ${url}`);
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const [lon, lat] = data.features[0].geometry.coordinates;
            log(`Geocoding successful: ${city} -> (${lat}, ${lon})`);
        } else {
            log(`Geocoding failed: No results for ${city}`, "WARN");
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
// coordinates format: "lon,lat;lon,lat;lon,lat"
app.get("/route", async (req, res) => {
    const { coordinates } = req.query;

    log(`Route request with coordinates: ${coordinates}`);

    if (!coordinates) {
        log("Route request failed: Missing coordinates parameter", "ERROR");
        return res.status(400).json({ error: "Missing coordinates parameter" });
    }

    if (!GH_KEY) {
        log("Route request failed: Missing GH_KEY in .env", "ERROR");
        return res.status(500).json({ error: "Missing GH_KEY in .env" });
    }

    // Convert "lon,lat" → "lat,lon" because GraphHopper expects lat-first
    const points = coordinates
        .split(";")
        .map(c => {
            const [lon, lat] = c.split(",");
            return `${lat},${lon}`;
        });

    log(`Converted ${points.length} coordinate points`);

    // Build GraphHopper URL dynamically
    const ghURL =
        `https://graphhopper.com/api/1/route?vehicle=car&locale=en&key=${GH_KEY}` +
        points.map(p => `&point=${p}`).join("");

    log(`GraphHopper request URL: ${ghURL.substring(0, 100)}...`);

    try {
        const response = await fetch(ghURL);
        const data = await response.json();

        if (!response.ok) {
            log(`GraphHopper error: ${JSON.stringify(data)}`, "ERROR");
            return res.status(response.status).json({ error: data });
        }

        log(`GraphHopper route retrieved successfully`);
        return res.json(data);
    } catch (err) {
        log(`GraphHopper exception: ${err.message}`, "ERROR");
        return res.status(500).json({ error: "Routing failed" });
    }
});

// -----------------------------
// 🧠 ML Route Analysis (Python Integration)
// -----------------------------
app.post("/analyze-routes", async (req, res) => {
    log("=".repeat(60));
    log("ROUTE ANALYSIS REQUEST RECEIVED");
    log("=".repeat(60));
    
    const { source, destination, priorities } = req.body;
    
    log(`Source: ${source}`);
    log(`Destination: ${destination}`);
    log(`Priorities: ${JSON.stringify(priorities)}`);

    if (!source || !destination) {
        log("Route analysis failed: Source and destination required", "ERROR");
        return res.status(400).json({ error: "Source and destination required" });
    }

    try {
        // First, geocode source and destination to get coordinates
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

        // Photon API returns coordinates as [lon, lat]
        const [sourceLon, sourceLat] = sourceData.features[0].geometry.coordinates;
        const [destLon, destLat] = destData.features[0].geometry.coordinates;

        log(`Geocoded successfully:`);
        log(`  Source: ${source} -> (${sourceLat}, ${sourceLon})`);
        log(`  Destination: ${destination} -> (${destLat}, ${destLon})`);

        // Prepare user priorities (normalize to 0-1 range)
        const userPriorities = {
            time: (priorities?.time || 25) / 100,
            distance: (priorities?.distance || 25) / 100,
            safety: (priorities?.safety || 25) / 100,
            carbon_emission: (priorities?.carbonEmission || 25) / 100
        };
        
        log(`Normalized priorities: ${JSON.stringify(userPriorities)}`);

        // Call Python ML module (using run_analysis.py which calls main.py's logic)
        const pythonScript = path.resolve(__dirname, "..", "ml_module", "run_analysis.py");
        log(`Python script path: ${pythonScript}`);
        
        // Prepare input for ML module (coordinate-agnostic - no geocoding in ML module)
        const inputData = JSON.stringify({
            source_lat: sourceLat,      // Will be mapped to origin_lat in run_analysis.py
            source_lon: sourceLon,     // Will be mapped to origin_lng in run_analysis.py
            dest_lat: destLat,          // Will be mapped to dest_lat in run_analysis.py
            dest_lon: destLon,          // Will be mapped to dest_lng in run_analysis.py
            source_name: source,        // Optional: for display/logging only
            dest_name: destination,     // Optional: for display/logging only
            priorities: userPriorities  // User priorities (0-1 range)
        });
        
        log(`Spawning Python process...`);
        log(`Input data size: ${inputData.length} bytes`);

        // Use absolute path and shell execution for Windows paths with spaces
        const pythonProcess = spawn(`python "${pythonScript}"`, [], {
            cwd: path.join(__dirname, ".."),
            shell: true
        });

        let stdout = "";
        let stderr = "";

        // Send input data to Python process
        log(`Sending input data to Python process...`);
        pythonProcess.stdin.write(inputData);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on("data", (data) => {
            const chunk = data.toString();
            stdout += chunk;
            // Log Python stdout in real-time
            process.stdout.write(`[PYTHON STDOUT] ${chunk}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderr += chunk;
            // Log Python stderr in real-time
            process.stderr.write(`[PYTHON STDERR] ${chunk}`);
        });

        pythonProcess.on("close", (code) => {
            log(`Python process exited with code: ${code}`);
            
            if (code !== 0) {
                log(`Python process error (code ${code}): ${stderr}`, "ERROR");
                return res.status(500).json({ 
                    error: "ML analysis failed", 
                    details: stderr 
                });
            }

            log(`Python stdout length: ${stdout.length} characters`);
            log(`Python stderr length: ${stderr.length} characters`);

            try {
                // Parse the JSON output from Python (may have log messages before JSON)
                log("Parsing Python output...");
                const lines = stdout.trim().split("\n");
                let jsonLine = "";
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith("{") || line.startsWith("[")) {
                        jsonLine = line;
                        // Try to find complete JSON (might span multiple lines)
                        if (i < lines.length - 1) {
                            jsonLine = lines.slice(i).join("\n");
                        }
                        break;
                    }
                }
                
                if (!jsonLine) {
                    log("No JSON found in Python output", "ERROR");
                    log(`Last 500 chars of stdout: ${stdout.substring(Math.max(0, stdout.length - 500))}`);
                    throw new Error("No JSON found in Python output");
                }

                log(`Found JSON output (${jsonLine.length} characters)`);
                const result = JSON.parse(jsonLine);
                log("JSON parsed successfully");

                // Transform Python result to frontend format
                log("Transforming routes for frontend...");
                // Get resilience scores from result.resilience_scores
                const resilienceScores = result.resilience_scores || {};
                const scoredRoutes = resilienceScores.routes || [];
                
                log(`Found ${result.routes?.length || 0} routes from ML module`);
                log(`Found ${scoredRoutes.length} resilience scores`);
                
                const routes = result.routes?.map((route, index) => {
                    // Find matching resilience score data (try exact match first, then partial)
                    const routeName = route.route_name || `Route ${index + 1}`;
                    let scoreData = scoredRoutes.find(r => r.route_name === routeName);
                    
                    // If no exact match, try to find by index or partial name match
                    if (!scoreData && scoredRoutes.length > index) {
                        scoreData = scoredRoutes[index];
                        log(`Route name mismatch: Using score by index for route ${routeName}`);
                    }
                    
                    // Get resilience score (0-100 scale from ML module)
                    let resilienceScore100 = scoreData?.overall_resilience_score || 0;
                    
                    if (resilienceScore100 === 0) {
                        log(`WARNING: Route ${routeName} has zero resilience score. Using fallback calculation.`, "WARN");
                        log(`Available scored routes: ${scoredRoutes.map(r => `${r.route_name}(${r.overall_resilience_score})`).join(", ")}`);
                        // Fallback: calculate a basic score from available data
                        const weatherRisk = scoreData?.weather_risk_score || 50;
                        const roadSafety = scoreData?.road_safety_score || 50;
                        const socialRisk = route.social_risk || 50;
                        const trafficRisk = scoreData?.traffic_risk_score || 50;
                        // Simple weighted calculation
                        resilienceScore100 = Math.round(
                            (100 - weatherRisk) * 0.2 + 
                            roadSafety * 0.3 + 
                            (100 - socialRisk) * 0.2 + 
                            (100 - trafficRisk) * 0.3
                        );
                        log(`Fallback resilience score calculated: ${resilienceScore100}`);
                    }
                    
                    // Convert to 0-10 scale for frontend display
                    const resilienceScore = resilienceScore100 / 10;

                    // Determine status based on score (routes with score > 8 are recommended)
                    let status = "Under Evaluation";
                    if (resilienceScore > 8) {
                        status = "Recommended";
                    } else if (resilienceScore < 6) {
                        status = "Flagged";
                    }

                    // Determine risk level
                    let disruptionRisk = "Low";
                    const socialRisk = route.social_risk || 50;
                    const weatherRisk = route.weather?.risk_level || "moderate";
                    if (socialRisk > 70 || weatherRisk === "high") {
                        disruptionRisk = "High";
                    } else if (socialRisk > 40 || weatherRisk === "moderate") {
                        disruptionRisk = "Medium";
                    }

                    // Format duration
                    const durationHours = Math.round(route.predicted_duration_min / 60);
                    const timeText = durationHours > 0 ? `${durationHours} hrs` : `${Math.round(route.predicted_duration_min)} mins`;

                    // Format distance
                    const distanceKm = Math.round(route.distance_m / 1000);
                    const distanceText = `${distanceKm} km`;

                    // Estimate cost (simplified - can be enhanced)
                    const costPerKm = 15; // ₹15 per km estimate
                    const cost = Math.round(distanceKm * costPerKm);
                    const costText = `₹${cost.toLocaleString()}`;

                    // Estimate carbon (simplified - can be enhanced)
                    const carbonPerKm = 0.05; // kg CO2 per km
                    const carbon = Math.round(distanceKm * carbonPerKm);
                    const carbonText = `${carbon} kg CO₂`;

                    return {
                        id: String(index + 1),
                        origin: source,
                        destination: destination,
                        resilienceScore: resilienceScore, // 0-10 scale
                        status: status,
                        time: timeText,
                        cost: costText,
                        carbonEmission: carbonText,
                        disruptionRisk: disruptionRisk,
                        distance: distanceText,
                        lastUpdated: "Just now",
                        courier: {
                            name: route.route_name || `Route ${index + 1}`,
                            avatar: (route.route_name || `R${index + 1}`).substring(0, 2).toUpperCase()
                        },
                        isRecommended: resilienceScore > 8, // Recommended if score > 8
                        coordinates: {
                            origin: [sourceLat, sourceLon],
                            destination: [destLat, destLon]
                        },
                        // Gemini AI output data
                        geminiOutput: scoreData ? {
                            weather_risk_score: scoreData.weather_risk_score || 50,
                            road_safety_score: scoreData.road_safety_score || 50,
                            social_risk_score: scoreData.social_risk_score || 50,
                            traffic_risk_score: scoreData.traffic_risk_score || 50,
                            overall_resilience_score: resilienceScore100,
                            short_summary: scoreData.short_summary || "No summary available",
                            reasoning: scoreData.reasoning || "No reasoning provided"
                        } : null
                    };
                }) || [];

                log(`Transformed ${routes.length} routes for frontend`);
                const recommendedCount = routes.filter(r => r.resilienceScore > 8).length;
                log(`Recommended routes (score > 8): ${recommendedCount}`);
                log(`Evaluated routes (total): ${routes.length}`);
                
                // Cache the enriched routes (without scores) for re-scoring
                const cacheKey = `${source}_${destination}`;
                routeCache.set(cacheKey, {
                    routes: result.routes,  // Store enriched routes from ML module
                    source: source,
                    destination: destination,
                    coordinates: {
                        origin: [sourceLat, sourceLon],
                        destination: [destLat, destLon]
                    }
                });
                log(`Cached routes for ${cacheKey}`);
                
                log("=".repeat(60));
                log("ROUTE ANALYSIS COMPLETE - Sending response");
                log("=".repeat(60));

                res.json({
                    routes: routes,
                    bestRoute: result.best_route,
                    analysisComplete: result.analysis_complete
                });
            } catch (parseError) {
                log(`Parse error: ${parseError.message}`, "ERROR");
                log(`Python stdout (first 500 chars): ${stdout.substring(0, 500)}`, "ERROR");
                return res.status(500).json({ 
                    error: "Failed to parse ML results", 
                    details: parseError.message,
                    stdout: stdout.substring(0, 500)
                });
            }
        });

    } catch (err) {
        log(`Route analysis error: ${err.message}`, "ERROR");
        log(`Stack trace: ${err.stack}`, "ERROR");
        return res.status(500).json({ error: "Route analysis failed", details: err.message });
    }
});

// -----------------------------
// 🔄 Re-score Routes (Only Gemini - No Google Maps)
// -----------------------------
app.post("/rescore-routes", async (req, res) => {
    log("=".repeat(60));
    log("RE-SCORING REQUEST RECEIVED");
    log("=".repeat(60));
    
    const { source, destination, priorities } = req.body;
    
    log(`Source: ${source}`);
    log(`Destination: ${destination}`);
    log(`New Priorities: ${JSON.stringify(priorities)}`);

    if (!source || !destination) {
        log("Re-scoring failed: Source and destination required", "ERROR");
        return res.status(400).json({ error: "Source and destination required" });
    }

    // Check cache for existing routes
    const cacheKey = `${source}_${destination}`;
    const cached = routeCache.get(cacheKey);
    
    if (!cached) {
        log("Re-scoring failed: No cached routes found. Please select route first.", "ERROR");
        return res.status(400).json({ 
            error: "No routes found. Please select source and destination first." 
        });
    }

    try {
        // Prepare user priorities (normalize to 0-1 range)
        const userPriorities = {
            time: (priorities?.time || 25) / 100,
            distance: (priorities?.distance || 25) / 100,
            safety: (priorities?.safety || 25) / 100,
            carbon_emission: (priorities?.carbonEmission || 25) / 100
        };
        
        log(`Normalized priorities: ${JSON.stringify(userPriorities)}`);
        log(`Using cached routes (${cached.routes.length} routes)`);

        // Call Python re-scoring script (only Gemini, no Google Maps)
        const pythonScript = path.resolve(__dirname, "..", "ml_module", "rescore_routes.py");
        log(`Python script path: ${pythonScript}`);
        
        const inputData = JSON.stringify({
            routes_data: cached.routes,
            priorities: userPriorities
        });
        
        log(`Spawning Python process for re-scoring...`);
        log(`Input data size: ${inputData.length} bytes`);

        // Use absolute path and shell execution for Windows paths with spaces
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
            process.stdout.write(`[PYTHON STDOUT] ${chunk}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderr += chunk;
            process.stderr.write(`[PYTHON STDERR] ${chunk}`);
        });

        pythonProcess.on("close", (code) => {
            log(`Python process exited with code: ${code}`);
            
            if (code !== 0) {
                log(`Python process error (code ${code}): ${stderr}`, "ERROR");
                return res.status(500).json({ 
                    error: "Re-scoring failed", 
                    details: stderr 
                });
            }

            try {
                log("Parsing Python output...");
                const lines = stdout.trim().split("\n");
                let jsonLine = "";
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith("{") || line.startsWith("[")) {
                        jsonLine = line;
                        if (i < lines.length - 1) {
                            jsonLine = lines.slice(i).join("\n");
                        }
                        break;
                    }
                }
                
                if (!jsonLine) {
                    log("No JSON found in Python output", "ERROR");
                    throw new Error("No JSON found in Python output");
                }

                const result = JSON.parse(jsonLine);
                log("JSON parsed successfully");

                if (result.error) {
                    log(`Re-scoring error: ${result.error}`, "ERROR");
                    return res.status(500).json({ error: result.error });
                }

                // Transform re-scored results to frontend format
                const resilienceScores = result.resilience_scores || {};
                const scoredRoutes = resilienceScores.routes || [];
                const enrichedRoutes = result.routes || cached.routes;
                
                log(`Found ${enrichedRoutes.length} routes`);
                log(`Found ${scoredRoutes.length} new resilience scores`);
                
                const routes = enrichedRoutes.map((route, index) => {
                    const scoreData = scoredRoutes.find(
                        r => r.route_name === route.route_name
                    );
                    
                    const resilienceScore100 = scoreData?.overall_resilience_score || 0;
                    const resilienceScore = resilienceScore100 / 10;

                    let status = "Under Evaluation";
                    if (resilienceScore > 8) {
                        status = "Recommended";
                    } else if (resilienceScore < 6) {
                        status = "Flagged";
                    }

                    let disruptionRisk = "Low";
                    const socialRisk = route.social_risk || 50;
                    const weatherRisk = route.weather?.risk_level || "moderate";
                    if (socialRisk > 70 || weatherRisk === "high") {
                        disruptionRisk = "High";
                    } else if (socialRisk > 40 || weatherRisk === "moderate") {
                        disruptionRisk = "Medium";
                    }

                    const durationHours = Math.round(route.predicted_duration_min / 60);
                    const timeText = durationHours > 0 ? `${durationHours} hrs` : `${Math.round(route.predicted_duration_min)} mins`;
                    const distanceKm = Math.round(route.distance_m / 1000);
                    const distanceText = `${distanceKm} km`;
                    const costPerKm = 15;
                    const cost = Math.round(distanceKm * costPerKm);
                    const costText = `₹${cost.toLocaleString()}`;
                    const carbonPerKm = 0.05;
                    const carbon = Math.round(distanceKm * carbonPerKm);
                    const carbonText = `${carbon} kg CO₂`;

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
                            name: route.route_name || `Route ${index + 1}`,
                            avatar: (route.route_name || `R${index + 1}`).substring(0, 2).toUpperCase()
                        },
                        isRecommended: resilienceScore > 8,
                        coordinates: cached.coordinates,
                        // Gemini AI output data
                        geminiOutput: scoreData ? {
                            weather_risk_score: scoreData.weather_risk_score || 50,
                            road_safety_score: scoreData.road_safety_score || 50,
                            social_risk_score: scoreData.social_risk_score || 50,
                            traffic_risk_score: scoreData.traffic_risk_score || 50,
                            overall_resilience_score: resilienceScore100,
                            short_summary: scoreData.short_summary || "No summary available",
                            reasoning: scoreData.reasoning || "No reasoning provided"
                        } : null
                    };
                });

                const recommendedCount = routes.filter(r => r.resilienceScore > 8).length;
                log(`Recommended routes (score > 8): ${recommendedCount}`);
                log(`Evaluated routes (total): ${routes.length}`);
                
                log("=".repeat(60));
                log("RE-SCORING COMPLETE - Sending response");
                log("=".repeat(60));

                res.json({
                    routes: routes,
                    bestRoute: resilienceScores.best_route_name,
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
    log("Backend API endpoints:");
    log("  GET  / - API information");
    log("  GET  /geocode?city=<name> - Geocode city");
    log("  GET  /route?coordinates=<coords> - Get route");
    log("  POST /analyze-routes - Analyze routes with ML module");
    log("=".repeat(60));
});
