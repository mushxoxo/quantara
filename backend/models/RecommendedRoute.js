import mongoose from "mongoose";

const RecommendedRouteSchema = new mongoose.Schema({
    ml_route_id: String,
    route_name: String,

    source: String,
    destination: String,

    overview_polyline: String,

    decoded_coordinates: [
        {
            lat: Number,
            lng: Number
        }
    ],

    intermediate_cities: [
        {
            name: String,
            lat: Number,
            lon: Number
        }
    ],

    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model(
    "RecommendedRoute",
    RecommendedRouteSchema
);
