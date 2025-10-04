# Nigzsu Business Intelligence Dashboard

A modern React and FastAPI business intelligence dashboard that converts CCTV-derived data into actionable insights. Features role-based access for administrators and clients with real-time analytics from Google Sheets CSV data.

## 🏗️ Architecture

**Frontend**: React SPA with TypeScript, ECharts/Recharts visualizations, React Router navigation, and professional dark theme  
**Backend**: FastAPI REST API with modular design, HTTP Basic Auth, SHA-256 password hashing, and Pandas data processing  
**Data**: Google Sheets CSV exports as primary data source, JSON file-based user storage  
**Deployment**: Docker multi-stage builds with Nginx, optimized for Google Cloud Run

## 📋 Prerequisites

- **Python 3.11+** (for backend)
- **Node.js 20+** (for frontend)
- **Docker** (for containerized deployment)
- **Google Cloud CLI** (for Cloud Run deployment)

## 🚀 Local Development

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the FastAPI server**
   ```bash
   cd ..
   python3 -m uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8000 --reload
   ```

   Backend API will be available at `http://localhost:8000`  
   API documentation at `http://localhost:8000/docs`

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install Node dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   HOST=0.0.0.0 npm start
   ```

   Frontend will be available at `http://localhost:5000`

### Running Both Services

For development, run both commands in separate terminals:

```bash
# Terminal 1: Backend
python3 -m uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend  
cd frontend && HOST=0.0.0.0 npm start
```

## 🐳 Docker Build & Testing

### Build the Docker image

```bash
docker build -t nigzsu-analytics .
```

### Run locally with Docker

```bash
docker run -p 8080:8080 nigzsu-analytics
```

Application will be available at `http://localhost:8080`

### Verify the build

```bash
# Check container health
curl http://localhost:8080/health

# Test API
curl http://localhost:8080/api/
```

## ☁️ Google Cloud Run Deployment

### Prerequisites

1. **Install Google Cloud CLI**
   ```bash
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   ```

2. **Authenticate and configure**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

### Deploy to Cloud Run

**Option 1: Direct deployment from source**
```bash
gcloud run deploy nigzsu-analytics \
  --source . \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
```

**Option 2: Build and deploy from Docker image**
```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/nigzsu-analytics

# Deploy the image
gcloud run deploy nigzsu-analytics \
  --image gcr.io/YOUR_PROJECT_ID/nigzsu-analytics \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1
```

### Environment Variables (Optional)

Set environment variables during deployment if needed:

```bash
gcloud run deploy nigzsu-analytics \
  --source . \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production"
```

**Note:** The app uses Google Sheets CSV exports (via public URLs) for data and local JSON files for user storage. No cloud storage buckets are required.

### Post-Deployment

After deployment, Cloud Run will provide a URL like:
```
https://nigzsu-analytics-xxxxxx-uc.a.run.app
```

Access your application at this URL.

## 📁 Project Structure

```
nigzsu/
├── backend/              # FastAPI backend
│   ├── app/             # Core modules (auth, database, models)
│   ├── data/            # JSON data files
│   └── fastapi_app.py   # Main application entry
├── frontend/            # React TypeScript frontend
│   ├── src/            # Source code
│   │   ├── components/ # Reusable components
│   │   ├── pages/      # Page components
│   │   └── styles/     # CSS styles
│   └── package.json    # Frontend dependencies
├── Dockerfile          # Multi-stage Docker build
├── app.yaml           # Cloud Run configuration examples
└── .gcloudignore     # Files to exclude from deployment
```

## 🔐 Default Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Client Account:**
- Username: `client1`
- Password: `client123`

⚠️ **Change these credentials in production!**

## 🔧 Configuration Files

- **`backend/requirements.txt`** - Python dependencies
- **`frontend/package.json`** - Node.js dependencies
- **`frontend/.env`** - Development environment variables
- **`frontend/.env.production`** - Production build configuration
- **`Dockerfile`** - Container build instructions
- **`.gcloudignore`** - Deployment exclusions

## 📊 Key Features

- **Role-Based Access Control** - Admin and client user roles
- **Real-time Analytics** - Interactive charts and data visualizations
- **Google Sheets Integration** - CSV data import from public URLs
- **View Token System** - Secure data sharing with expiring tokens
- **Export Functionality** - PDF, Excel, and CSV export options
- **Advanced Filtering** - Date range and search capabilities
- **Responsive Design** - Professional dark theme UI

## 🛠️ Development Notes

- Backend uses **Pandas** for CSV processing and data manipulation
- Frontend uses **ECharts** and **Recharts** for data visualization
- Authentication uses **SHA-256** password hashing
- Production deployment uses **Nginx** as reverse proxy
- Multi-stage Docker build optimizes image size
- Cloud Run auto-scales based on traffic

## 📝 License

Proprietary - All rights reserved
