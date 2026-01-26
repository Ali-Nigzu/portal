"""
Authentication utilities for camOS Analytics API
"""

import hashlib
from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .data.json_store import load_users, save_users

security = HTTPBasic()


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash"""
    try:
        if ':' not in stored_hash:
            return password == stored_hash
        salt, hash_part = stored_hash.split(':', 1)
        password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
        return password_hash == hash_part
    except:
        return False


def authenticate_user(credentials: HTTPBasicCredentials = Depends(security)):
    """Authenticate user and update last login timestamp"""
    users = load_users()
    
    if credentials.username not in users:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    user = users[credentials.username]
    
    if not verify_password(credentials.password, user['password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    users[credentials.username]['last_login'] = datetime.now().isoformat()
    save_users(users)
    
    return {
        'username': credentials.username,
        'role': user['role'],
        'name': user.get('name', credentials.username)
    }
