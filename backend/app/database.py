"""
Database operations for Nigzsu Analytics API
JSON file-based storage with atomic writes
"""

import os
import json
import tempfile
import shutil
from typing import Optional, Dict
import hashlib
import secrets

from .config import USERS_FILE, ALARM_LOGS_FILE, DEVICE_LISTS_FILE


def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt"""
    salt = secrets.token_hex(16)
    password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{password_hash}"


def load_users():
    """Load user credentials from JSON file"""
    if not os.path.exists(USERS_FILE):
        users_data = {
            "admin": {
                "password": hash_password("admin123"),
                "role": "admin",
                "name": "System Administrator",
                "last_login": None,
                "data_sources": []
            },
            "client1": {
                "password": hash_password("client123"),
                "role": "client",
                "name": "Test Client 1",
                "csv_url": "https://docs.google.com/spreadsheets/d/1B6Kg19ONObAmXliyuQNTL0-fh-6ueXOY_amadASZ1W4/export?format=csv&gid=368477740",
                "last_login": None,
                "data_sources": []
            },
            "client2": {
                "password": hash_password("client456"),
                "role": "client",
                "name": "Test Client 2",
                "csv_url": "https://docs.google.com/spreadsheets/d/10oFKUDhiKjAIqTaJyCa20r9lbTdSgjPK4HwmdCplUgU/export?format=csv",
                "last_login": None,
                "data_sources": []
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(users_data, f, indent=2)
        return users_data
    
    with open(USERS_FILE, 'r') as f:
        users = json.load(f)
    
    modified = False
    for username, user_data in users.items():
        if 'last_login' not in user_data:
            user_data['last_login'] = None
            modified = True
        if 'data_sources' not in user_data:
            user_data['data_sources'] = []
            modified = True
    
    if modified:
        save_users(users)
    
    return users


def save_users(users_data: dict):
    """Save users data to JSON file using atomic write"""
    file_dir = os.path.dirname(USERS_FILE) or '.'
    
    temp_fd, temp_path = tempfile.mkstemp(dir=file_dir, suffix='.tmp')
    try:
        with os.fdopen(temp_fd, 'w') as f:
            json.dump(users_data, f, indent=2)
        shutil.move(temp_path, USERS_FILE)
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise e


def get_active_data_source_url(client_id: str, users: dict) -> Optional[str]:
    """Get the active data source URL for a client"""
    if client_id not in users:
        return None
    
    client_data = users[client_id]
    
    data_sources = client_data.get('data_sources', [])
    for source in data_sources:
        if source.get('active', False):
            return source.get('url')
    
    return client_data.get('csv_url')


def load_alarm_logs():
    """Load alarm logs from JSON file"""
    if not os.path.exists(ALARM_LOGS_FILE):
        return {}
    with open(ALARM_LOGS_FILE, 'r') as f:
        return json.load(f)


def save_alarm_logs(alarm_data: dict):
    """Save alarm logs to JSON file"""
    with open(ALARM_LOGS_FILE, 'w') as f:
        json.dump(alarm_data, f, indent=2)


def load_device_lists():
    """Load device lists from JSON file"""
    if not os.path.exists(DEVICE_LISTS_FILE):
        return {}
    with open(DEVICE_LISTS_FILE, 'r') as f:
        return json.load(f)


def save_device_lists(device_data: dict):
    """Save device lists to JSON file"""
    with open(DEVICE_LISTS_FILE, 'w') as f:
        json.dump(device_data, f, indent=2)
