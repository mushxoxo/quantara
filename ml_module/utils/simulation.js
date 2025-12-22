
import CoveredPoint from "../../backend/models/CoveredPoints.js";

async function simulateRoute(routeDoc) {

    console.log("🚀 Simulation started for route:", routeDoc.route_name);

    if (!Array.isArray(routeDoc.decoded_coordinates)) {
        console.error("❌ decoded_coordinates missing");
        return;
    }

    for (const point of routeDoc.decoded_coordinates) {

        const isIntermediate = routeDoc.intermediate_cities.some(city =>
            Math.abs(city.lat - point.lat) < 0.05 &&
            Math.abs(city.lon - point.lng) < 0.05
        );

        console.log("💾 SAVING COVERED POINT", point.lat, point.lng);

        await CoveredPoint.create({
            routeId: routeDoc.ml_route_id,
            routeName: routeDoc.route_name,

            source: routeDoc.source,
            destination: routeDoc.destination,

            lat: point.lat,
            lon: point.lng,

            isIntermediate
        });

        await new Promise(res => setTimeout(res, 300));
    }

    console.log("✅ Simulation completed");
}

export default simulateRoute;
