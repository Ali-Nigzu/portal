# camOS Business Intelligence Dashboard

A modern React and FastAPI business intelligence dashboard that converts CCTV-derived data into actionable insights. The analytics stack now follows the LINE development plan with canonical ChartSpec/ChartResult contracts, deterministic BigQuery math, and strict per-client table isolation.

> **Note**
> The application intentionally focuses on analytics workflows only—no greeting or welcome-message feature is provided or required for its operation.

## 🏗️ Architecture

**Frontend**: React SPA with TypeScript and a shared chart renderer that consumes `ChartResult` payloads produced by the backend.
**Backend**: FastAPI REST API with modular design, HTTP Basic Auth, SHA-256 password hashing, and analytics services that translate `ChartSpec` requests into tested SQL templates.
**Data**: Google BigQuery per-client datasets (`client0`, `client1`, …) that all implement the shared CCTV event schema. User metadata remains in JSON during the rebuild.
**Deployment**: Docker multi-stage builds with Nginx, optimized for Google Cloud Run

## 📐 Analytics Contracts & Fixtures

- Canonical `ChartSpec` and `ChartResult` JSON Schemas live in `shared/analytics/schemas` and are mirrored as TypeScript types in `frontend/src/analytics/schemas/charting.ts`.
- Example payloads and golden ChartResults reside in `shared/analytics/examples`.
- The deterministic fixture dataset (`shared/analytics/fixtures/events_golden_client0.csv`) powers both CI tests and BigQuery fixture tables. Regenerate the JSON outputs with:

  ```bash
  python backend/app/analytics/generate_expected.py
  ```

- Schema validation tests (`backend/tests/test_chart_schemas.py`) guarantee that the examples remain aligned with the JSON Schemas.
- See `docs/analytics/foundations.md` for the full Phase 1 summary, validated assumptions, and Phase 2 readiness plan.

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
docker build -t camOS-analytics .
```

### Run locally with Docker

```bash
docker run -p 8080:8080 camOS-analytics
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
gcloud run deploy camOS-analytics \
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
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/camOS-analytics

# Deploy the image
gcloud run deploy camOS-analytics \
  --image gcr.io/YOUR_PROJECT_ID/camOS-analytics \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1
```

### Environment Variables (Optional)

Set environment variables during deployment if needed:

```bash
gcloud run deploy camOS-analytics \
  --source . \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production"
```

### BigQuery configuration

Set the following runtime variables so the backend can reach BigQuery:

- `BQ_PROJECT`: GCP project that owns the datasets (e.g. `nigzsu`).
- `BQ_DATASET`: Logical dataset alias that maps to per-client tables (e.g. `client_events`).
- `BQ_LOCATION`: Region for all queries (e.g. `EU`).
- Provide credentials either by pointing `GOOGLE_APPLICATION_CREDENTIALS` to the downloaded `sa.json` or by exporting `BQ_SERVICE_ACCOUNT_JSON` with the raw key contents.

The default user mapping resolves `client1` → `nigzsu.client_events.client0` and `client2` → `nigzsu.client_events.client1`. Adjust `backend/data/users.json` if you add more accounts. Each authenticated organisation must only ever hit its own table; no cross-client joins are performed.

Caching defaults to an in-process TTL cache for development. Future Cloud Memorystore support will be toggled via:

```bash
export CACHE_BACKEND=redis
export REDIS_URL=redis://HOST:PORT
```

Leave `CACHE_BACKEND=local` until infrastructure is provisioned.

Analytics data stays read-only in BigQuery. User metadata continues to live in local JSON files while the rebuild is in progress.

### Post-Deployment

After deployment, Cloud Run will provide a URL like:
```
https://camOS-analytics-xxxxxx-uc.a.run.app
```

Access your application at this URL.

## 📁 Project Structure

```
camOS/
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
- **Spec-driven Analytics** - Shared ChartSpec/ChartResult engine backed by tested SQL templates
- **View Token System** - Secure data sharing with expiring tokens
- **Export Functionality** - PDF, Excel, and CSV export options
- **Advanced Filtering** - Date range and search capabilities
- **Responsive Design** - Professional dark theme UI

## 🛠️ Development Notes

- Backend uses **Pandas** for fixture generation and BigQuery result normalisation
- Frontend uses **ECharts** and **Recharts** for data visualization while migrating to the shared chart engine
- Authentication uses **SHA-256** password hashing
- Production deployment uses **Nginx** as reverse proxy
- Multi-stage Docker build optimizes image size
- Cloud Run auto-scales based on traffic

## 📝 License

Proprietary - All rights reserved
