# Quantara - B2B Supply Chain Route Resilience Dashboard

A comprehensive supply chain route analysis platform that uses AI-powered resilience scoring to help businesses optimize their logistics routes. The system analyzes multiple route alternatives, evaluates risks (weather, traffic, social, road safety), and provides intelligent recommendations based on user-defined priorities.

## 🚀 Features

- **AI-Powered Route Analysis**: Uses Google Gemini AI to evaluate route resilience based on multiple factors
- **Interactive Map Visualization**: Real-time route visualization with Leaflet maps
- **Dynamic Priority Controls**: Adjust route priorities (time, distance, safety, carbon emission) with real-time recalculation
- **Comprehensive Risk Assessment**: 
  - Weather risk analysis
  - Road safety evaluation
  - Social/political risk assessment
  - Traffic risk scoring
- **Route Recommendations**: Automatically identifies and highlights recommended routes (resilience score > 8)
- **Detailed AI Insights**: View detailed Gemini AI analysis for each route including scores, summaries, and reasoning
- **Loading Progress Tracking**: Real-time progress indicators and logs during route analysis
- **Dark Mode Support**: Full dark mode theme support
- **Responsive Design**: Modern, responsive UI built with React and Tailwind CSS

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Radix UI** components
- **React Leaflet** for map visualization
- **Motion** for animations

### Backend
- **Node.js** with Express
- **Python** ML module for route analysis
- **Google Maps API** for route data
- **Google Gemini AI** for resilience scoring
- **GraphHopper API** for route polyline generation
- **Photon API** for geocoding

### ML Module
- **Python** with various analysis modules:
  - Weather analysis
  - Road data analysis
  - Political/social risk analysis
  - Resilience scoring with Gemini AI

## 📁 Project Structure

```
quantara/
├── B2B Dashboard Design/     # Frontend React application
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── App.tsx           # Main application component
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
├── backend/                   # Node.js Express server
│   ├── server.js             # Main server file
│   └── package.json
├── ml_module/                 # Python ML analysis module
│   ├── routes/               # Route fetching (Google Maps, OpenRouteService)
│   ├── weather/              # Weather analysis
│   ├── road_data/            # Road analysis
│   ├── risk_analysis/        # Political/social risk analysis
│   ├── resilience/           # Gemini AI resilience scoring
│   └── utils/                # Utility functions and logging
├── logs/                      # Application logs
├── launch.bat                 # Windows launch script
└── README.md
```

## 🔧 Setup Instructions

### Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **npm** or **yarn**
- API Keys:
  - Google Maps API key
  - Google Gemini API key
  - GraphHopper API key (optional, for fallback routing)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd quantara
   ```

2. **Install Frontend Dependencies**
   ```bash
   cd "B2B Dashboard Design"
   npm install
   ```

3. **Install Backend Dependencies**
   ```bash
   cd ../backend
   npm install
   ```

4. **Install Python Dependencies**
   ```bash
   cd ../ml_module
   pip install -r requirements.txt
   ```
   *(Note: If requirements.txt doesn't exist, install dependencies manually based on imports in the Python files)*

5. **Set Up Environment Variables**

   Create a `.env` file in the root directory:
   ```env
   # Google Maps API Key
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key

   # Google Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key

   # GraphHopper API Key (optional, for fallback routing)
   GH_KEY=your_graphhopper_api_key
   ```

   The backend will also read from `.env` in the backend directory if needed.

## 🚀 Running the Application

### Option 1: Using Launch Script (Windows)

Simply double-click `launch.bat` or run:
```bash
launch.bat
```

This will:
- Start the backend server on `http://localhost:5000`
- Start the frontend dev server (typically on `http://localhost:5173`)
- Open both in separate terminal windows

### Option 2: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
npm run server
```

**Terminal 2 - Frontend:**
```bash
cd "B2B Dashboard Design"
npm run dev
```

## 📡 API Endpoints

### Backend API (`http://localhost:5000`)

- `GET /` - API information and available endpoints
- `GET /geocode?city=<city_name>` - Geocode city name to coordinates
- `GET /route?coordinates=<lon1,lat1;lon2,lat2>` - Get route polyline between coordinates
- `POST /analyze-routes` - Analyze routes with ML module (calls Google Maps)
  ```json
  {
    "source": "Mumbai",
    "destination": "Delhi",
    "priorities": {
      "time": 25,
      "distance": 25,
      "safety": 25,
      "carbonEmission": 25
    }
  }
  ```
- `POST /rescore-routes` - Re-score routes with new priorities (only Gemini, no Google Maps)
  ```json
  {
    "source": "Mumbai",
    "destination": "Delhi",
    "priorities": {
      "time": 30,
      "distance": 20,
      "safety": 30,
      "carbonEmission": 20
    }
  }
  ```

## 🎯 Usage

1. **Select Origin and Destination**
   - On the landing page, enter your source and destination cities
   - Click "Continue" to start analysis

2. **View Route Analysis**
   - The system will fetch routes from Google Maps
   - AI analysis will calculate resilience scores for each route
   - Routes are displayed in the left sidebar

3. **Adjust Priorities**
   - Use the sliders to adjust priorities:
     - **Time Priority**: Weight for travel time
     - **Distance Priority**: Weight for route distance
     - **Safety Priority**: Weight for road safety
     - **Carbon Emission Priority**: Weight for environmental impact
   - Click "Recalculate" to update scores based on new priorities

4. **View Route Details**
   - Select a route from the list to view on the map
   - Click the dropdown button on the Efficiency Score card to see detailed AI analysis
   - View recommended routes (score > 8) in the "Recommended" tab

5. **Explore AI Insights**
   - Expand the Efficiency Score card to see:
     - AI summary and reasoning
     - Detailed risk scores (weather, road safety, social, traffic)
     - Overall resilience score breakdown

## 📊 Route Scoring

Routes are scored on a 0-100 scale based on:

- **Weather Risk** (0-100): Higher = worse weather conditions
- **Road Safety** (0-100): Higher = safer roads
- **Social Risk** (0-100): Higher = more political/social disruption risk
- **Traffic Risk** (0-100): Higher = worse traffic conditions
- **Overall Resilience** (0-100): Weighted composite score considering all factors and user priorities

Routes with an overall resilience score > 80 (8.0 on 0-10 scale) are marked as "Recommended".

## 🔍 Logging

The application maintains comprehensive logs:

- **Backend logs**: `logs/backend.log`
- **ML Module logs**: `logs/ml_module.log`

Logs include:
- API requests and responses
- Route analysis progress
- Gemini AI interactions
- Error messages and debugging information

## 🎨 UI Features

- **Resizable Panels**: Adjust panel sizes for optimal viewing
- **Dark Mode**: Toggle between light and dark themes
- **Loading Overlays**: Real-time progress tracking with logs
- **Interactive Maps**: Zoom, pan, and explore routes
- **Responsive Design**: Works on different screen sizes

## 🐛 Troubleshooting

### Backend not starting
- Check if port 5000 is available
- Verify environment variables are set correctly
- Check `logs/backend.log` for errors

### Frontend not connecting to backend
- Ensure backend is running on `http://localhost:5000`
- Check CORS settings in `backend/server.js`
- Verify API endpoints in browser console

### Python ML module errors
- Ensure Python dependencies are installed
- Check `logs/ml_module.log` for detailed error messages
- Verify API keys are set correctly

### No routes returned
- Verify Google Maps API key is valid and has proper permissions
- Check network connectivity
- Review backend logs for API errors

## 📝 Development Notes

- The system caches route data to avoid redundant Google Maps API calls when priorities change
- Only Gemini AI re-scoring runs when priorities are updated (not full route fetching)
- All API calls are logged for debugging and monitoring
- The frontend uses debouncing and loading states to provide smooth user experience

## 🔐 Security Notes

- Never commit `.env` files to version control
- Keep API keys secure and rotate them regularly
- The `.gitignore` file excludes sensitive files and logs

## 📄 License

[Add your license information here]

## 👥 Contributors

[Add contributor information here]

## 🙏 Acknowledgments

- Google Maps API for route data
- Google Gemini AI for intelligent route analysis
- GraphHopper for fallback routing
- Photon API for geocoding
- OpenStreetMap for map tiles

---

For more information or support, please refer to the project documentation or open an issue.
