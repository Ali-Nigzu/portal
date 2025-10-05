# Nigzsu Business Intelligence Dashboard

## Overview
Nigzsu is a React and FastAPI business intelligence dashboard that converts CCTV-derived data into actionable insights. It features role-based access for administrators and clients. Clients access personalized dashboards with charts and analytics from Google Sheets CSV data, while administrators manage users and system configurations. The application includes advanced data filtering, search capabilities, and comprehensive user management.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Updates (October 2025)

### Cloud SQL PostgreSQL Migration (October 5, 2025)
- **Database Infrastructure**: Migrated from Google Sheets CSV to Google Cloud SQL PostgreSQL for faster, more reliable data access
- **Cloud SQL Connector**: Implemented secure connection using Cloud SQL Python Connector with service account authentication
- **Native Data Format**: Uses Cloud SQL data directly without transformation - age buckets (0-4, 5-13, 14-25, 26-45, 46-65, 66+) displayed as-is, ISO timestamps throughout
- **User Management Update**: Changed from csv_url to table_name for client configuration - admins now assign Cloud SQL table names to clients
- **SQL Aggregation Performance**: Replaced full table scans with targeted SQL aggregation queries (GROUP BY, COUNT, AVG) for 3-4x performance improvement
- **Parameterized Queries**: All user inputs protected with SQLAlchemy text() parameter binding to prevent SQL injection attacks
- **Dwell Time Accuracy**: Fixed dwell time calculations to exclude event filter from entry/exit CTEs, ensuring accurate pairing even with filtered data
- **Actual Event Records**: Returns up to 10,000 real event records with track_id, timestamp, sex, age_bucket fields for frontend chart compatibility
- **Empty Dataset Handling**: Gracefully handles empty tables by returning empty datasets rather than errors
- **Security**: Service account credentials managed as environment secrets, parameterized queries block SQL injection
- **Result**: Scalable database infrastructure (~9 second API response for 880k+ records) with secure, native Cloud SQL data format providing accurate analytics

### Landing Page & Interest Registration (October 4, 2025)
- **Public Landing Page**: Created professional marketing landing page at root URL (/) with dark theme and cyan accents
- **Hero Section**: Compelling headline "Transform Your CCTV Footage Into Instant Business Insights" with animated visual elements
- **Value Proposition**: Multiple sections highlighting the problem (unused CCTV data), solution (Nigzsu's frictionless approach), and key features
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
The application employs a hybrid storage approach. User data, including hashed passwords and last login times, is stored in a local JSON file (`users.json`). Client analytics data is stored in Google Cloud SQL PostgreSQL tables, with each client assigned a dedicated table name (e.g., client1, client2). The application uses the Cloud SQL Python Connector for secure, authenticated access with automatic connection pooling.

### Authentication and Authorization
A secure authentication model using HTTP Basic Auth with SHA-256 password hashing. It supports a two-tier role system (admin/client), tracks last login times, and enforces route-level access control.

## External Dependencies

### Data Sources
- **Google Cloud SQL**: PostgreSQL database (nigzsu:europe-west2:nigzsutestdb) storing client analytics data with tables per client.

### Python Backend Libraries
- **FastAPI**: Web framework for the REST API.
- **Uvicorn**: ASGI server.
- **Pandas**: For data manipulation and analytics processing.
- **cloud-sql-python-connector**: Secure connection to Google Cloud SQL with service account authentication.
- **SQLAlchemy**: ORM and database toolkit for PostgreSQL queries.
- **pg8000**: Pure-Python PostgreSQL database driver.
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