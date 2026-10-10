"""
Configuration settings for camOS Analytics API
"""

import os

CONTACT_SUBMISSIONS_FILE = 'backend/data/contact_submissions.json'



def get_allowed_origins():
    """Get allowed origins based on environment"""
    origins = []
    
    if os.environ.get("NODE_ENV") != "production":
        origins.extend([
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "http://0.0.0.0:5000",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://localhost:5174",
        ])
    
    replit_domain = os.environ.get("REPLIT_DOMAINS", "")
    if replit_domain:
        origins.extend([
            f"https://{replit_domain}",
            f"http://{replit_domain}",
        ])
    
    cloud_run_service = os.environ.get("CLOUD_RUN_SERVICE_URL", "")
    if cloud_run_service:
        origins.append(cloud_run_service)
    
    production_domain = os.environ.get("PRODUCTION_DOMAIN", "")
    if production_domain:
        origins.extend([
            f"https://{production_domain}",
            f"http://{production_domain}",
        ])
    
    return list(set(origin for origin in origins if origin))
