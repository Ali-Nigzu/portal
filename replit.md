# Nigzsu Business Intelligence Dashboard

## Overview

Nigzsu is a Flask-based business intelligence dashboard application that transforms CCTV-derived data into actionable insights for businesses. The application provides role-based access control with separate interfaces for administrators and clients. Clients can view personalized dashboards with charts and analytics based on their specific CSV data stored in Google Cloud Storage, while administrators can manage users and system configurations. The system supports data filtering, chart exports, and CSV file uploads for enhanced data management capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The application uses a traditional server-side rendered architecture with Flask templates and Bootstrap 5 for styling. The frontend consists of:
- **Template Engine**: Jinja2 templates with a base template inheritance pattern
- **Styling**: Bootstrap 5 with custom dark theme CSS inspired by Victron design
- **Interactive Components**: Plotly.js for data visualizations and vanilla JavaScript for dashboard interactions
- **User Interface**: Responsive design with separate layouts for landing page, login, client dashboards, and admin panel

### Backend Architecture
The backend is built on Flask with a simple but effective architecture:
- **Web Framework**: Flask with session-based authentication
- **File Structure**: Single main application file (app.py) with modular template organization
- **Authentication**: Simple JSON-based user storage with role-based access control (admin/client roles)
- **Data Processing**: Pandas for CSV data manipulation and Plotly for chart generation
- **File Handling**: Werkzeug utilities for secure file uploads

### Data Storage Solutions
The application uses a hybrid storage approach:
- **User Management**: Local JSON file (users.json) for storing user credentials and configurations
- **Data Storage**: Google Cloud Storage bucket for CSV files with client-specific folder organization
- **Session Management**: Flask session storage with configurable secret key
- **File Organization**: Client uploads stored in dedicated GCS folders, with separate data folders per client

### Authentication and Authorization
Simple but effective security model:
- **Authentication Method**: Username/password authentication with Flask sessions
- **User Roles**: Two-tier role system (admin/client) with different access levels
- **Session Management**: Server-side session storage with logout functionality
- **Access Control**: Route-level protection based on user roles and login status

## External Dependencies

### Cloud Services
- **Google Cloud Storage**: Primary data storage for CSV files and client uploads
- **Bucket Configuration**: Uses 'nigzsu_cdata-testclient1' bucket with organized folder structure

### Python Libraries
- **Flask 3.1.2**: Core web framework for routing and templating
- **google-cloud-storage 3.4.0**: GCS integration for file storage and retrieval
- **pandas 2.3.2**: Data manipulation and CSV processing
- **plotly 6.3.0**: Interactive chart generation and data visualization
- **Werkzeug 3.1.3**: Secure filename handling and utilities
- **gunicorn 23.0.0**: WSGI server for production deployment

### Frontend Dependencies
- **Bootstrap 5**: CSS framework for responsive design and components
- **Plotly.js**: Client-side charting library loaded via CDN

### Deployment Infrastructure
- **Target Platform**: Google Cloud Run (Dockerfile-ready)
- **Production Server**: Gunicorn WSGI server
- **Environment Configuration**: Environment variable support for secrets and configuration