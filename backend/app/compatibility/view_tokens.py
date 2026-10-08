"""
View Token Management for camOS Analytics API
Temporary access tokens for client dashboard viewing
"""

import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

view_tokens: Dict[str, Dict[str, Any]] = {}


def validate_view_token(token: str) -> Optional[Dict[str, Any]]:
    """Validate a view token and return client info if valid"""
    clean_expired_tokens()
    
    if token not in view_tokens:
        return None
    
    token_data = view_tokens[token]
    
    if datetime.now() > token_data['expires_at']:
        del view_tokens[token]
        return None
    
    token_data['used_count'] += 1
    
    if token_data['used_count'] > 999999:
        del view_tokens[token]
        return None
    
    return token_data


def clean_expired_tokens():
    """Remove expired tokens from storage"""
    now = datetime.now()
    expired = [token for token, data in view_tokens.items() if now > data['expires_at']]
    for token in expired:
        del view_tokens[token]
    if expired:
        logger.info(f"Cleaned {len(expired)} expired tokens")
