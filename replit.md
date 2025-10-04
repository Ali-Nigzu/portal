# Nigzsu Business Intelligence Dashboard

## Overview
Nigzsu is a React and FastAPI business intelligence dashboard that converts CCTV-derived data into actionable insights. It features role-based access for administrators and clients. Clients access personalized dashboards with charts and analytics from Google Sheets CSV data, while administrators manage users and system configurations. The application includes advanced data filtering, search capabilities, and comprehensive user management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
A modern React SPA built with TypeScript, featuring a professional dark theme. It utilizes React Router for navigation, ECharts and Recharts for data visualizations, and react-datepicker for date selections. State management is handled with React hooks, and the build process uses Create React App with Craco.

### Backend Architecture
A FastAPI-based REST API with a modular and secure design. The backend is organized into modules for authentication, database operations, data models, configuration, view token management, and data processing. It uses HTTP Basic Auth with SHA-256 password hashing and stores user data in JSON files with atomic write operations. Data processing leverages Pandas for CSV manipulation.

### Data Storage Solutions
The application employs a hybrid storage approach. User data, including hashed passwords and last login times, is stored in a local JSON file (`users.json`). Client data sources are configured as an array of objects, each specifying an ID, title, URL, and type (Camera/Sensor/Gateway), with Google Sheets CSV exports serving as the primary data format.

### Authentication and Authorization
A secure authentication model using HTTP Basic Auth with SHA-256 password hashing. It supports a two-tier role system (admin/client), tracks last login times, and enforces route-level access control.

## External Dependencies

### Data Sources
- **Google Sheets**: Primary source for business data via public CSV export URLs.

### Python Backend Libraries
- **FastAPI**: Web framework for the REST API.
- **Uvicorn**: ASGI server.
- **Pandas**: For data manipulation and CSV processing.
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