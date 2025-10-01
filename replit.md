# Nigzsu Business Intelligence Dashboard

## Overview

Nigzsu is a modern React + FastAPI business intelligence dashboard application that transforms CCTV-derived data into actionable insights for businesses. The application provides role-based access control with separate interfaces for administrators and clients. Clients can view personalized dashboards with charts and analytics based on their specific CSV data from Google Sheets, while administrators can manage users and system configurations. The system supports advanced data filtering with date range pickers, comprehensive search capabilities, and full user management.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Major Updates (October 2025)

### Event Log Enhancements
- Date range picker with calendar UI using react-datepicker library
- Track ID search functionality with partial matching
- Comprehensive filtering system (Event Type, Gender, Age Group, Track ID, Date Range)
- Real-time filtering with event counters
- Dark theme styling matching VRM design aesthetic

### Admin System Overhaul
- Complete user management system with last login tracking
- Add/Edit/Delete users with persistent changes to users.json
- Password hashing with SHA-256 for security
- "View Dashboard" feature to see client views in new tabs
- System statistics cards showing user metrics

### Site-Wide Professional Polish
- Removed all emojis for professional appearance
- Consistent VRM-inspired dark theme throughout

### Technical Improvements
- Downgraded from React 19 to React 18.3.1 for library compatibility
- Fixed react-datepicker integration issues
- Optimized data processing for 275k+ record datasets

## System Architecture

### Frontend Architecture
Modern React SPA with TypeScript and professional dark theme:
- **Framework**: React 18.3.1 with TypeScript for type safety
- **UI Library**: Custom VRM-inspired dark theme with professional styling
- **Routing**: React Router v6 for client-side navigation
- **Charts**: ECharts and Recharts for interactive data visualizations
- **Date Pickers**: react-datepicker library with custom dark theme styling
- **State Management**: React hooks (useState, useEffect, useCallback)
- **Build Tool**: Create React App with Craco for custom webpack configuration

### Backend Architecture
FastAPI-based REST API with secure authentication:
- **Web Framework**: FastAPI with async support
- **Authentication**: HTTP Basic Auth with SHA-256 password hashing
- **File Structure**: Single fastapi_app.py with modular endpoint organization
- **User Management**: JSON-based user storage (users.json) with last login tracking
- **Data Processing**: Pandas for CSV data manipulation and filtering
- **CORS**: Configured for React frontend integration

### Data Storage Solutions
The application uses a hybrid storage approach:
- **User Management**: Local JSON file (users.json) with password hashing and last login tracking
- **Data Source**: Google Sheets CSV exports via public URLs
- **Client Configuration**: Each client has a dedicated csv_url for their data source
- **Session Management**: HTTP Basic Auth for API authentication

### Authentication and Authorization
Secure authentication model:
- **Authentication Method**: HTTP Basic Auth with SHA-256 password hashing
- **User Roles**: Two-tier role system (admin/client) with different access levels
- **Last Login Tracking**: Timestamps recorded on every authentication
- **Access Control**: Route-level protection based on user roles and credentials
- **Password Security**: Salted SHA-256 hashing with legacy plaintext support for migration

## External Dependencies

### Data Sources
- **Google Sheets**: Primary data source via CSV export URLs
- **Client Configuration**: Each client has a configurable data source URL

### Python Backend Libraries
- **FastAPI**: Modern async web framework for REST API
- **Uvicorn**: ASGI server for running FastAPI
- **Pandas 2.3.2**: Data manipulation and CSV processing
- **python-multipart**: Form data and file upload handling

### React Frontend Libraries
- **React 18.3.1**: Core UI framework
- **React Router 6.26.0**: Client-side routing
- **react-datepicker 7.5.0**: Date range picker with calendar UI
- **ECharts 5.6.0**: Professional charting library
- **Recharts 3.2.1**: Additional chart components
- **TypeScript**: Type safety and developer experience

### Deployment Infrastructure
- **Target Platform**: Google Cloud Run (Dockerfile-ready)
- **Production Server**: Uvicorn ASGI server
- **Build Process**: Multi-stage Docker build with nginx for React SPA
- **Environment Configuration**: Environment variable support for secrets and configuration