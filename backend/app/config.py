"""
Configuration settings for camOS Analytics API
"""

import os

CONTACT_SUBMISSIONS_FILE = 'backend/data/contact_submissions.json'



def get_allowed_origins():
    """Get allowed origins based on environment"""
    origins = []

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
