"""
Nigzsu Flask Application
Business Intelligence Dashboard for CCTV-derived Data Analytics
"""

import os
import json
import pandas as pd
import plotly.graph_objs as go
import plotly.utils
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, send_file
from werkzeug.utils import secure_filename
from google.cloud import storage
import io
import base64

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'dev-secret-key-change-in-production')

# Configuration
GCS_BUCKET = 'nigzsu_cdata-testclient1'
UPLOAD_FOLDER = 'cuploads'

# User credentials storage
USERS_FILE = 'users.json'

# Initialize users if file doesn't exist
def init_users():
    if not os.path.exists(USERS_FILE):
        users_data = {
            "admin": {
                "password": "admin123",
                "role": "admin",
                "name": "System Administrator"
            },
            "client1": {
                "password": "client123",
                "role": "client",
                "name": "Test Client 1",
                "csv_url": "https://storage.googleapis.com/nigzsu_cdata-testclient1/client0/testdata.csv"
            },
            "client2": {
                "password": "client456", 
                "role": "client",
                "name": "Test Client 2",
                "csv_url": "https://storage.googleapis.com/nigzsu_cdata-testclient1/client1/testdata0.csv"
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(users_data, f, indent=2)

def load_users():
    with open(USERS_FILE, 'r') as f:
        return json.load(f)

def save_users(users_data):
    with open(USERS_FILE, 'w') as f:
        json.dump(users_data, f, indent=2)

# Routes
@app.route('/')
def landing():
    """Landing page with placeholder branding and login button"""
    return render_template('landing.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page for both admins and clients"""
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        users = load_users()
        
        if username in users and users[username]['password'] == password:
            session['username'] = username
            session['role'] = users[username]['role']
            session['name'] = users[username]['name']
            
            if users[username]['role'] == 'admin':
                return redirect(url_for('admin_dashboard'))
            else:
                return redirect(url_for('client_dashboard'))
        else:
            flash('Invalid credentials')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logout and redirect to landing page"""
    session.clear()
    return redirect(url_for('landing'))

@app.route('/dashboard')
def client_dashboard():
    """Client dashboard with modular charts"""
    if 'username' not in session or session['role'] != 'client':
        return redirect(url_for('login'))
    
    return render_template('dashboard.html', username=session['username'], name=session['name'])

@app.route('/admin')
def admin_dashboard():
    """Admin dashboard for user management"""
    if 'username' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    users = load_users()
    return render_template('admin.html', users=users)

@app.route('/api/chart-data')
def get_chart_data():
    """API endpoint to fetch and process CSV data for charts"""
    if 'username' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        users = load_users()
        
        # Get CSV URL for current user
        if session['role'] == 'client':
            if 'csv_url' not in users[session['username']]:
                return jsonify({'error': 'No CSV configured for this user'}), 400
            csv_url = users[session['username']]['csv_url']
        else:
            # Admin can view any client's data
            client_id = request.args.get('client_id')
            if not client_id or client_id not in users:
                return jsonify({'error': 'Invalid client ID'}), 400
            csv_url = users[client_id].get('csv_url')
            if not csv_url:
                return jsonify({'error': 'No CSV configured for this client'}), 400
        
        # Fetch CSV data
        df = pd.read_csv(csv_url)
        
        # Process timestamp column
        df['timestamp'] = pd.to_datetime(df['timestamp'], format='%H:%M:%d:%m:%Y')
        df['hour'] = df['timestamp'].dt.hour
        df['day_of_week'] = df['timestamp'].dt.day_name()
        
        # Apply filters if provided
        filters = request.args.to_dict()
        if 'start_date' in filters and filters['start_date']:
            df = df[df['timestamp'] >= pd.to_datetime(filters['start_date'])]
        if 'end_date' in filters and filters['end_date']:
            df = df[df['timestamp'] <= pd.to_datetime(filters['end_date'])]
        if 'gender' in filters and filters['gender']:
            df = df[df['sex'] == filters['gender']]
        if 'age_group' in filters and filters['age_group']:
            df = df[df['age_estimate'] == filters['age_group']]
        
        return jsonify({
            'data': df.to_dict(orient='records'),
            'summary': {
                'total_records': len(df),
                'date_range': {
                    'start': df['timestamp'].min().isoformat() if len(df) > 0 else None,
                    'end': df['timestamp'].max().isoformat() if len(df) > 0 else None
                }
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_users()
    app.run(host='0.0.0.0', port=5000, debug=True)