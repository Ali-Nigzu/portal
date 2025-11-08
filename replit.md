# camOS Business Intelligence Dashboard

## Overview
camOS is a React and FastAPI business intelligence dashboard that converts CCTV-derived data into actionable insights. It features role-based access for administrators and clients. Clients access personalized dashboards with charts and analytics from Google BigQuery tables, while administrators manage users and system configurations. The application includes advanced data filtering, search capabilities, and comprehensive user management.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Updates (October 2025)

### BigQuery Analytics Migration (October 5, 2025)
- **Data Warehouse**: Moved analytics storage from Cloud SQL to Google BigQuery for sub-second scans on partitioned tables.
- **Service Account Access**: Configured workload to use `portal-bq-reader@nigzsu.iam.gserviceaccount.com` with read-only roles.
- **Parameterized SQL**: Rewrote aggregation and search queries with BigQuery Standard SQL and named parameters for safety.
- **Partition-aware Filtering**: All queries include timestamp predicates and optional cluster filters to minimize scanned bytes.
- **Dwell-Time Logic**: Ported window-function occupancy calculation using `TIMESTAMP_DIFF`, `LAG`, and `LEAD` in BigQuery.
- **Result Consistency**: Maintained legacy API response shapes so the React dashboard required no changes.
- **Caching**: Added a 2-minute TTL cache on analytics responses to keep P95 latency under 1.5s.
- **Health Check**: Implemented startup probe that issues `SELECT 1` against BigQuery to fail fast on credential issues.

### Landing Page & Interest Registration (October 4, 2025)
- **Public Landing Page**: Created professional marketing landing page at root URL (/) with dark theme and cyan accents
- **Hero Section**: Compelling headline "Transform Your CCTV Footage Into Instant Business Insights" with animated visual elements
- **Value Proposition**: Multiple sections highlighting the problem (unused CCTV data), solution (camOS's frictionless approach), and key features
- **Register Interest Form**: Comprehensive form capturing name, email, company, phone, business type, and message with client-side validation
- **Backend Endpoint**: New `/api/register-interest` endpoint stores submissions to `backend/data/interest_submissions.json` with UUID tracking
- **Updated Routing**: Landing page at `/`, login at `/login`, protected routes for authenticated users only
- **Navigation**: Clear separation between "Get Started" (scrolls to form) and "Login" (existing clients) buttons
- **Form Validation**: Client-side validation for required fields and email format before submission
- **Responsive Design**: Mobile-friendly layout adapting to different screen sizes
- **Result**: Professional customer-facing entry point that captures leads while keeping the dashboard secure

### Codebase Cleanup & Production Optimization (October 4, 2025)
- **Removed Unnecessary Files**: Cleaned up 40+ files including attached_assets/, old prompts, screenshots, design docs
- **Build Artifacts**: Removed committed frontend/build/ directory (3.3MB) and updated .gitignore to prevent future commits
- **Dependency Consolidation**: Moved export-related dependencies (html2canvas, jspdf, papaparse, xlsx) from root to frontend/package.json
- **Removed Unused Dependencies**: Eliminated google-cloud-storage and requests from backend requirements.txt
- **Removed Test Files**: Deleted test_deployment.py and duplicate root package.json files
- **Python Dependency Cleanup**: Removed unused root pyproject.toml and uv.lock (Dockerfile uses backend/requirements.txt)
- **Environment File Cleanup**: Removed duplicate frontend/public/.env, kept frontend/.env and frontend/.env.production
- **Documentation**: Created comprehensive README.md with local dev and Google Cloud Run deployment instructions
- **Removed Legacy Config**: Eliminated GCS_BUCKET environment variable references (app uses Google Sheets CSV and local JSON)
- **Result**: Leaner codebase, faster builds, production-ready structure with 100% functionality preserved

## System Architecture

### Frontend Architecture
A modern React SPA built with TypeScript, featuring a professional dark theme. It utilizes React Router for navigation, ECharts and Recharts for data visualizations, and react-datepicker for date selections. State management is handled with React hooks, and the build process uses Create React App with Craco.

### Backend Architecture
A FastAPI-based REST API with a modular and secure design. The backend is organized into modules for authentication, database operations, data models, configuration, view token management, and data processing. It uses HTTP Basic Auth with SHA-256 password hashing and stores user data in JSON files with atomic write operations. Data processing leverages Pandas for CSV manipulation.

### Data Storage Solutions
The application employs a hybrid storage approach. User data, including hashed passwords and last login times, is stored in a local JSON file (`users.json`). Client analytics data now resides in Google BigQuery tables (`nigzsu.demodata.client0`, `client1`), queried via the official BigQuery client with service-account authentication and query caching.

### Authentication and Authorization
A secure authentication model using HTTP Basic Auth with SHA-256 password hashing. It supports a two-tier role system (admin/client), tracks last login times, and enforces route-level access control.

## External Dependencies

### Data Sources
- **Google BigQuery**: Dataset `nigzsu.demodata` with partitioned tables (`client0`, `client1`) serving analytics queries.

### Python Backend Libraries
- **FastAPI**: Web framework for the REST API.
- **Uvicorn**: ASGI server.
- **Pandas**: For data manipulation and analytics processing.
- **google-cloud-bigquery**: Native client for executing parameterized BigQuery queries.
- **cachetools**: TTL cache used to memoize analytics responses.
- **pyarrow**: Columnar dependency for BigQuery DataFrame results.
- **python-multipart**: For form data handling.

### React Frontend Libraries
- **React**: Core UI framework.
- **React Router**: For client-side navigation.
- **react-datepicker**: For date selection UI.
- **ECharts**: For interactive data visualizations.
- **Recharts**: For additional chart components.
- **TypeScript**: For type safety and enhanced development.

### Deployment Infrastructure
- **Target Platform**: Google Cloud Run.
- **Containerization**: Docker with multi-stage builds.
- **Web Server**: Nginx for serving the React SPA.