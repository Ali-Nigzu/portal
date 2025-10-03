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

### View Token Authentication System (October 3, 2025)
- Extended view token support to all read-only endpoints (device-list, alarm-logs, chart-data)
- Fixed 401 authentication errors when using view tokens for client dashboards
- Implemented unified authentication: view_token first, then fallback to Basic Auth
- Eliminated credential popup dialogs when using temporary view tokens
- **Simplified token security**: 24-hour expiry (up from 5 minutes) and 999,999 usage limit (up from 100) for uninterrupted admin viewing

### Session Persistence & Logout Fixes (October 3, 2025)
- **Session Persistence**: Credentials now saved to sessionStorage, surviving page refreshes
- **Auto-restore**: Login state automatically restored on app reload from sessionStorage
- **Smart Logout**: Logout button properly handles both scenarios:
  - Normal login: Clears session and redirects to login page
  - View token session: Closes admin-opened tab or redirects to home
- **Security**: Session data cleared on logout and when browser tab closes
- **Admin View Navigation**: When viewing client dashboard via "View Dashboard" button, client navigation menu now displays properly, enabling access to all client pages (Event Logs, Alarm Logs, Device List, Analytics, Reports)
- **Enhanced Sidebar Toggle**: Improved collapse/expand functionality with larger hamburger menu icon (40x40), better visibility, and consistent behavior across all user scenarios
  - Fixed disappearing toggle button: Navigation menu now scrolls independently while toggle button remains anchored at bottom
  - CSS improvements: Added overflow-y scrolling to nav, min-height: 0 for proper flex behavior, flex-shrink: 0 on toggle button

### Reports System Implementation (October 3, 2025)
- Complete redesign with unique metrics per report type (not shared metrics with different values)
- Four distinct report types with specific metrics:
  - **Occupancy Summary**: Current occupancy, capacity utilization, average dwell time, peak times, floor utilization, hourly patterns
  - **Traffic Flow Analysis**: Total entries/exits (with exits data in all exports), peak flow times and rates, average flow rate, congestion points, hourly flow patterns
  - **Demographics Report**: Total visitors, gender distribution, age distribution, visitor profiles, peak demographic with gender (e.g., "Female 25-40 age group")
  - **Device Performance**: Total/online/offline devices (consistent counts), uptime, data quality, device status table, maintenance alerts and schedules
- Export functionality in three formats:
  - **PDF Export**: Using jsPDF library with clean Nigzsu branding
  - **Excel Export**: Using xlsx library with proper worksheet structure
  - **CSV Export**: Custom generation with proper formatting
- Data consistency improvements:
  - Demographics: Peak demographic combines most common gender AND age group
  - Traffic Flow: Exit data included in hourly breakdowns across all export formats
  - Device Performance: Simple "Not available" alert for unavailable data
- Professional UI with clean design:
  - No emojis throughout the interface
  - Heading simplified to "Reports"
  - Extended time filters: Last 7 Days, Last 30 Days, Past Year, This Month, Last Month, All Time, Custom Range
  - Streamlined report cards showing type badge and description

### Admin Experience Improvements (October 1, 2025)
- Fixed admin default route to land on /admin page instead of client dashboard
- Role-based routing: admins → /admin, clients → /dashboard
- Consistent navigation and access control across all user roles

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