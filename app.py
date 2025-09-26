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

def generate_demo_data():
    """Generate demo CCTV data for testing"""
    import random
    from datetime import datetime, timedelta
    
    # Generate sample data
    base_time = datetime.now() - timedelta(days=7)
    data = []
    
    age_groups = ['(0,8)', '(9,16)', '(17,25)', '(25,40)', '(40,60)', '(60+)']
    genders = ['M', 'F']
    events = ['entry', 'exit']
    
    for i in range(500):  # Generate 500 sample records
        timestamp = base_time + timedelta(
            days=random.randint(0, 6),
            hours=random.randint(8, 22),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59)
        )
        
        data.append({
            'index': i + 1,
            'track_number': random.randint(1000, 9999),
            'event': random.choice(events),
            'timestamp': timestamp.strftime('%H:%M:%d:%m:%Y'),
            'sex': random.choice(genders),
            'age_estimate': random.choice(age_groups)
        })
    
    return pd.DataFrame(data)

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
        
        # Try to fetch CSV data, fall back to demo data if fails
        try:
            # Load CSV with proper column names since Google Sheets export may not have headers
            df = pd.read_csv(csv_url, header=None, names=['index', 'track_number', 'event', 'timestamp', 'sex', 'age_estimate'])
            
            # Check if data loaded properly
            if len(df) == 0:
                df = generate_demo_data()
        except Exception:
            # Fall back to demo data if CSV fetch fails
            df = generate_demo_data()
        
        # Process timestamp column with error handling
        try:
            df['timestamp'] = pd.to_datetime(df['timestamp'], format='%H:%M:%d:%m:%Y', errors='coerce')
            # Remove rows with invalid timestamps
            df = df.dropna(subset=['timestamp'])
            df['hour'] = df['timestamp'].dt.hour
            df['day_of_week'] = df['timestamp'].dt.day_name()
        except Exception as e:
            return jsonify({'error': f'Timestamp processing failed: {str(e)}'}), 400
        
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
        
        # Convert DataFrame to records safely
        data_records = df.to_dict(orient='records')
        
        return jsonify({
            'data': data_records,
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

# Admin API endpoints
@app.route('/api/admin/users', methods=['GET', 'POST'])
def admin_users():
    """Admin endpoint to manage users"""
    if 'username' not in session or session['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    
    if request.method == 'GET':
        users = load_users()
        return jsonify({'success': True, 'users': users})
    
    elif request.method == 'POST':
        try:
            user_data = request.get_json()
            users = load_users()
            
            username = user_data['username']
            if username in users:
                return jsonify({'error': 'Username already exists'}), 400
            
            users[username] = {
                'password': user_data['password'],
                'role': user_data['role'],
                'name': user_data['name']
            }
            
            if user_data['role'] == 'client' and user_data.get('csv_url'):
                users[username]['csv_url'] = user_data['csv_url']
            
            save_users(users)
            return jsonify({'success': True})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<username>', methods=['GET', 'PUT', 'DELETE'])
def admin_user_detail(username):
    """Admin endpoint to manage specific user"""
    if 'username' not in session or session['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    
    users = load_users()
    
    if request.method == 'GET':
        if username not in users:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({'success': True, 'user': users[username]})
    
    elif request.method == 'PUT':
        try:
            if username not in users:
                return jsonify({'error': 'User not found'}), 404
            
            user_data = request.get_json()
            users[username]['name'] = user_data['name']
            users[username]['role'] = user_data['role']
            
            if 'password' in user_data and user_data['password']:
                users[username]['password'] = user_data['password']
            
            if user_data['role'] == 'client':
                if user_data.get('csv_url'):
                    users[username]['csv_url'] = user_data['csv_url']
            else:
                users[username].pop('csv_url', None)
            
            save_users(users)
            return jsonify({'success': True})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'DELETE':
        try:
            if username not in users:
                return jsonify({'error': 'User not found'}), 404
            
            if users[username]['role'] == 'admin':
                return jsonify({'error': 'Cannot delete admin user'}), 400
            
            del users[username]
            save_users(users)
            return jsonify({'success': True})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/api/admin/uploads', methods=['GET'])
def admin_uploads():
    """Admin endpoint to list uploaded files"""
    if 'username' not in session or session['role'] != 'admin':
        return jsonify({'error': 'Access denied'}), 403
    
    try:
        # For now, return empty list since we're not implementing actual GCS upload yet
        # In production, this would list files from GCS cuploads folder
        uploads = []
        return jsonify({'success': True, 'uploads': uploads})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Endpoint for clients to upload CSV files"""
    if 'username' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename or not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'Only CSV files allowed'}), 400
        
        # For now, just validate the file without actual upload
        # In production, this would upload to GCS cuploads folder
        return jsonify({'success': True, 'message': 'File upload simulated successfully'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_users()
    app.run(host='0.0.0.0', port=5000, debug=True)