import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

interface User {
  name: string;
  role: 'client' | 'admin';
  csv_url?: string;
  last_login?: string | null;
}

interface AlarmEvent {
  id: string;
  instance: string;
  device: string;
  description: string;
  alarmStartedAt: string;
  alarmClearedAfter: string | null;
  severity: string;
  client_id: string;
}

interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSeen: string;
  dataSource?: string;
  location?: string;
  recordCount?: number;
  client_id: string;
}

interface AdminPageProps {
  credentials: { username: string; password: string };
}

const AdminPage: React.FC<AdminPageProps> = ({ credentials }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'alarms' | 'devices'>('users');
  const [users, setUsers] = useState<{ [key: string]: User }>({});
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  
  const [showAddAlarm, setShowAddAlarm] = useState(false);
  const [showEditAlarm, setShowEditAlarm] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<AlarmEvent | null>(null);
  
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showEditDevice, setShowEditDevice] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceInfo | null>(null);

  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    name: '',
    role: 'client' as 'client' | 'admin',
    csv_url: ''
  });

  const [editUser, setEditUser] = useState({
    password: '',
    name: '',
    role: 'client' as 'client' | 'admin',
    csv_url: ''
  });

  const [newAlarm, setNewAlarm] = useState({
    instance: '',
    device: '',
    description: '',
    alarmStartedAt: new Date().toISOString().slice(0, 16),
    alarmClearedAfter: '',
    severity: 'medium',
    client_id: ''
  });

  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'Camera',
    status: 'online',
    lastSeen: new Date().toISOString().slice(0, 16),
    dataSource: '',
    location: '',
    recordCount: 0,
    client_id: ''
  });

  const loadAdminData = React.useCallback(async () => {
    try {
      setLoading(true);
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || {});
        
        const clientUsers = Object.entries(data.users || {}).filter(([_, user]) => (user as User).role === 'client');
        if (clientUsers.length > 0 && !selectedClient) {
          setSelectedClient(clientUsers[0][0]);
        }
      } else {
        setAlert({ message: 'Failed to load users', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: `Failed to load admin data: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password, selectedClient]);

  const loadAlarms = React.useCallback(async (clientId: string) => {
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/alarm-logs?client_id=${clientId}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAlarms(data.alarms || []);
      }
    } catch (err) {
      setAlert({ message: 'Failed to load alarms', type: 'error' });
    }
  }, [credentials.username, credentials.password]);

  const loadDevices = React.useCallback(async (clientId: string) => {
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/device-list?client_id=${clientId}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      setAlert({ message: 'Failed to load devices', type: 'error' });
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (selectedClient && activeTab === 'alarms') {
      loadAlarms(selectedClient);
    }
  }, [selectedClient, activeTab, loadAlarms]);

  useEffect(() => {
    if (selectedClient && activeTab === 'devices') {
      loadDevices(selectedClient);
    }
  }, [selectedClient, activeTab, loadDevices]);

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.username.trim() || !newUser.password.trim() || !newUser.name.trim()) {
      setAlert({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'User added successfully', type: 'success' });
        setNewUser({ username: '', password: '', name: '', role: 'client', csv_url: '' });
        setShowAddUser(false);
        loadAdminData();
      } else {
        setAlert({ message: data.error || 'Failed to add user', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to add user', type: 'error' });
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editUser),
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'User updated successfully', type: 'success' });
        setShowEditUser(false);
        setEditingUser(null);
        loadAdminData();
      } else {
        setAlert({ message: data.error || 'Failed to update user', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to update user', type: 'error' });
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${username}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${auth}` },
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'User deleted successfully', type: 'success' });
        loadAdminData();
      } else {
        setAlert({ message: data.error || 'Failed to delete user', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to delete user', type: 'error' });
    }
  };

  const handleViewDashboard = async (username: string) => {
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/create-view-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ client_id: username }),
      });

      const data = await response.json();
      if (data.token) {
        window.open(`/dashboard?view_token=${data.token}`, '_blank');
      } else {
        setAlert({ message: 'Failed to create view token', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to open dashboard', type: 'error' });
    }
  };

  const handleAddAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newAlarm.client_id || !newAlarm.device || !newAlarm.description) {
      setAlert({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/alarm-logs`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAlarm),
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Alarm created successfully', type: 'success' });
        setShowAddAlarm(false);
        loadAlarms(selectedClient);
      } else {
        setAlert({ message: 'Failed to create alarm', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to create alarm', type: 'error' });
    }
  };

  const handleEditAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlarm) return;

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/alarm-logs/${editingAlarm.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingAlarm),
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Alarm updated successfully', type: 'success' });
        setShowEditAlarm(false);
        setEditingAlarm(null);
        loadAlarms(selectedClient);
      } else {
        setAlert({ message: 'Failed to update alarm', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to update alarm', type: 'error' });
    }
  };

  const handleDeleteAlarm = async (alarmId: string) => {
    if (!window.confirm('Are you sure you want to delete this alarm?')) return;

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/alarm-logs/${alarmId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${auth}` },
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Alarm deleted successfully', type: 'success' });
        loadAlarms(selectedClient);
      } else {
        setAlert({ message: 'Failed to delete alarm', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to delete alarm', type: 'error' });
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newDevice.client_id || !newDevice.name) {
      setAlert({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/device-list`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDevice),
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Device created successfully', type: 'success' });
        setShowAddDevice(false);
        loadDevices(selectedClient);
      } else {
        setAlert({ message: 'Failed to create device', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to create device', type: 'error' });
    }
  };

  const handleEditDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/device-list/${editingDevice.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingDevice),
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Device updated successfully', type: 'success' });
        setShowEditDevice(false);
        setEditingDevice(null);
        loadDevices(selectedClient);
      } else {
        setAlert({ message: 'Failed to update device', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to update device', type: 'error' });
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!window.confirm('Are you sure you want to delete this device?')) return;

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/device-list/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${auth}` },
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Device deleted successfully', type: 'success' });
        loadDevices(selectedClient);
      } else {
        setAlert({ message: 'Failed to delete device', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to delete device', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #333', 
            borderTop: '4px solid #1976d2', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--vrm-text-secondary)' }}>Loading admin data...</p>
        </div>
      </div>
    );
  }

  const clientUsers = Object.entries(users).filter(([_, user]) => user.role === 'client');

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Admin Panel
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Admin</span>
        </div>
      </div>

      {alert && (
        <div style={{ 
          marginBottom: '24px',
          padding: '12px 16px',
          backgroundColor: alert.type === 'success' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
          border: `1px solid ${alert.type === 'success' ? 'var(--vrm-accent-green)' : 'var(--vrm-accent-red)'}`,
          borderRadius: '6px',
          color: alert.type === 'success' ? 'var(--vrm-accent-green)' : 'var(--vrm-accent-red)'
        }}>
          {alert.message}
        </div>
      )}

      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--vrm-border-color)' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'users' ? 'var(--vrm-bg-tertiary)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'users' ? '2px solid var(--vrm-accent-blue)' : '2px solid transparent',
            color: activeTab === 'users' ? 'var(--vrm-accent-blue)' : 'var(--vrm-text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          User Management
        </button>
        <button
          onClick={() => setActiveTab('alarms')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'alarms' ? 'var(--vrm-bg-tertiary)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'alarms' ? '2px solid var(--vrm-accent-blue)' : '2px solid transparent',
            color: activeTab === 'alarms' ? 'var(--vrm-accent-blue)' : 'var(--vrm-text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          Alarm Logs
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'devices' ? 'var(--vrm-bg-tertiary)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'devices' ? '2px solid var(--vrm-accent-blue)' : '2px solid transparent',
            color: activeTab === 'devices' ? 'var(--vrm-accent-blue)' : 'var(--vrm-text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          Device List
        </button>
      </div>

      {activeTab === 'users' && (
        <div>
          <div className="vrm-card" style={{ marginBottom: '24px' }}>
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">User Management</h3>
              <div className="vrm-card-actions">
                <button className="vrm-btn vrm-btn-sm" onClick={() => setShowAddUser(true)}>
                  Add User
                </button>
              </div>
            </div>
            <div className="vrm-card-body" style={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="vrm-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>CSV URL</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(users).map(([username, user]) => (
                      <tr key={username}>
                        <td><code>{username}</code></td>
                        <td>{user.name}</td>
                        <td>
                          <span className={`vrm-status ${user.role === 'admin' ? 'vrm-status-warning' : 'vrm-status-online'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.csv_url || '-'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {user.role === 'client' && (
                              <button
                                className="vrm-btn vrm-btn-primary vrm-btn-sm"
                                onClick={() => handleViewDashboard(username)}
                              >
                                View Dashboard
                              </button>
                            )}
                            <button
                              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                              onClick={() => {
                                setEditingUser(username);
                                setEditUser({
                                  password: '',
                                  name: user.name,
                                  role: user.role,
                                  csv_url: user.csv_url || ''
                                });
                                setShowEditUser(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                              onClick={() => handleDeleteUser(username)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {showAddUser && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="vrm-card" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="vrm-card-header">
                  <h3 className="vrm-card-title">Add New User</h3>
                </div>
                <div className="vrm-card-body">
                  <form onSubmit={handleAddUser}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Username *
                      </label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Name *
                      </label>
                      <input
                        type="text"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Password *
                      </label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Role *
                      </label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'client' | 'admin' })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      >
                        <option value="client">Client</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {newUser.role === 'client' && (
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                          CSV URL
                        </label>
                        <input
                          type="text"
                          value={newUser.csv_url}
                          onChange={(e) => setNewUser({ ...newUser, csv_url: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px',
                            backgroundColor: 'var(--vrm-bg-tertiary)',
                            border: '1px solid var(--vrm-border-color)',
                            borderRadius: '4px',
                            color: 'var(--vrm-text-primary)'
                          }}
                        />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="vrm-btn vrm-btn-secondary"
                        onClick={() => {
                          setShowAddUser(false);
                          setNewUser({ username: '', password: '', name: '', role: 'client', csv_url: '' });
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="vrm-btn">
                        Create User
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {showEditUser && editingUser && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="vrm-card" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="vrm-card-header">
                  <h3 className="vrm-card-title">Edit User: {editingUser}</h3>
                </div>
                <div className="vrm-card-body">
                  <form onSubmit={handleEditUser}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editUser.name}
                        onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        New Password (leave blank to keep current)
                      </label>
                      <input
                        type="password"
                        value={editUser.password}
                        onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="vrm-btn vrm-btn-secondary"
                        onClick={() => {
                          setShowEditUser(false);
                          setEditingUser(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="vrm-btn">
                        Update User
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'alarms' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
              Select Client
            </label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                padding: '8px',
                backgroundColor: 'var(--vrm-bg-tertiary)',
                border: '1px solid var(--vrm-border-color)',
                borderRadius: '4px',
                color: 'var(--vrm-text-primary)'
              }}
            >
              {clientUsers.map(([username, user]) => (
                <option key={username} value={username}>
                  {user.name} ({username})
                </option>
              ))}
            </select>
          </div>

          <div className="vrm-card">
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Alarm Logs for {selectedClient}</h3>
              <div className="vrm-card-actions">
                <button
                  className="vrm-btn vrm-btn-sm"
                  onClick={() => {
                    setNewAlarm({
                      instance: '',
                      device: '',
                      description: '',
                      alarmStartedAt: new Date().toISOString().slice(0, 16),
                      alarmClearedAfter: '',
                      severity: 'medium',
                      client_id: selectedClient
                    });
                    setShowAddAlarm(true);
                  }}
                >
                  Add Alarm
                </button>
              </div>
            </div>
            <div className="vrm-card-body" style={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="vrm-table">
                  <thead>
                    <tr>
                      <th>Instance</th>
                      <th>Device</th>
                      <th>Description</th>
                      <th>Started</th>
                      <th>Cleared</th>
                      <th>Severity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alarms.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--vrm-text-secondary)' }}>
                          No alarms found for this client
                        </td>
                      </tr>
                    ) : (
                      alarms.map((alarm) => (
                        <tr key={alarm.id}>
                          <td><code>{alarm.instance}</code></td>
                          <td>{alarm.device}</td>
                          <td>{alarm.description}</td>
                          <td>{alarm.alarmStartedAt}</td>
                          <td>{alarm.alarmClearedAfter || 'Active'}</td>
                          <td>
                            <span className={`vrm-status ${
                              alarm.severity === 'high' ? 'vrm-status-offline' :
                              alarm.severity === 'medium' ? 'vrm-status-warning' :
                              'vrm-status-online'
                            }`}>
                              {alarm.severity}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                                onClick={() => {
                                  setEditingAlarm(alarm);
                                  setShowEditAlarm(true);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                                onClick={() => handleDeleteAlarm(alarm.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {showAddAlarm && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="vrm-card" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="vrm-card-header">
                  <h3 className="vrm-card-title">Add New Alarm</h3>
                </div>
                <div className="vrm-card-body">
                  <form onSubmit={handleAddAlarm}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Instance *
                      </label>
                      <input
                        type="text"
                        value={newAlarm.instance}
                        onChange={(e) => setNewAlarm({ ...newAlarm, instance: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Device *
                      </label>
                      <input
                        type="text"
                        value={newAlarm.device}
                        onChange={(e) => setNewAlarm({ ...newAlarm, device: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Description *
                      </label>
                      <textarea
                        value={newAlarm.description}
                        onChange={(e) => setNewAlarm({ ...newAlarm, description: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)',
                          minHeight: '80px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Severity *
                      </label>
                      <select
                        value={newAlarm.severity}
                        onChange={(e) => setNewAlarm({ ...newAlarm, severity: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="vrm-btn vrm-btn-secondary"
                        onClick={() => setShowAddAlarm(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="vrm-btn">
                        Create Alarm
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {showEditAlarm && editingAlarm && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="vrm-card" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="vrm-card-header">
                  <h3 className="vrm-card-title">Edit Alarm</h3>
                </div>
                <div className="vrm-card-body">
                  <form onSubmit={handleEditAlarm}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Description
                      </label>
                      <textarea
                        value={editingAlarm.description}
                        onChange={(e) => setEditingAlarm({ ...editingAlarm, description: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)',
                          minHeight: '80px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Cleared After (optional)
                      </label>
                      <input
                        type="text"
                        value={editingAlarm.alarmClearedAfter || ''}
                        onChange={(e) => setEditingAlarm({ ...editingAlarm, alarmClearedAfter: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                        placeholder="e.g., 5m, 10s"
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Severity
                      </label>
                      <select
                        value={editingAlarm.severity}
                        onChange={(e) => setEditingAlarm({ ...editingAlarm, severity: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="vrm-btn vrm-btn-secondary"
                        onClick={() => {
                          setShowEditAlarm(false);
                          setEditingAlarm(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="vrm-btn">
                        Update Alarm
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'devices' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
              Select Client
            </label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                padding: '8px',
                backgroundColor: 'var(--vrm-bg-tertiary)',
                border: '1px solid var(--vrm-border-color)',
                borderRadius: '4px',
                color: 'var(--vrm-text-primary)'
              }}
            >
              {clientUsers.map(([username, user]) => (
                <option key={username} value={username}>
                  {user.name} ({username})
                </option>
              ))}
            </select>
          </div>

          <div className="vrm-card">
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Device List for {selectedClient}</h3>
              <div className="vrm-card-actions">
                <button
                  className="vrm-btn vrm-btn-sm"
                  onClick={() => {
                    setNewDevice({
                      name: '',
                      type: 'Camera',
                      status: 'online',
                      lastSeen: new Date().toISOString().slice(0, 16),
                      dataSource: '',
                      location: '',
                      recordCount: 0,
                      client_id: selectedClient
                    });
                    setShowAddDevice(true);
                  }}
                >
                  Add Device
                </button>
              </div>
            </div>
            <div className="vrm-card-body" style={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="vrm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Last Seen</th>
                      <th>Records</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--vrm-text-secondary)' }}>
                          No devices found for this client
                        </td>
                      </tr>
                    ) : (
                      devices.map((device) => (
                        <tr key={device.id}>
                          <td>{device.name}</td>
                          <td>{device.type}</td>
                          <td>
                            <span className={`vrm-status ${
                              device.status === 'online' ? 'vrm-status-online' :
                              device.status === 'offline' ? 'vrm-status-offline' :
                              'vrm-status-warning'
                            }`}>
                              {device.status}
                            </span>
                          </td>
                          <td>{device.location || '-'}</td>
                          <td>{device.lastSeen}</td>
                          <td>{device.recordCount?.toLocaleString() || 0}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                                onClick={() => {
                                  setEditingDevice(device);
                                  setShowEditDevice(true);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                                onClick={() => handleDeleteDevice(device.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {showAddDevice && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="vrm-card" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="vrm-card-header">
                  <h3 className="vrm-card-title">Add New Device</h3>
                </div>
                <div className="vrm-card-body">
                  <form onSubmit={handleAddDevice}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Device Name *
                      </label>
                      <input
                        type="text"
                        value={newDevice.name}
                        onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Type *
                      </label>
                      <select
                        value={newDevice.type}
                        onChange={(e) => setNewDevice({ ...newDevice, type: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      >
                        <option value="Camera">Camera</option>
                        <option value="Sensor">Sensor</option>
                        <option value="Gateway">Gateway</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Status *
                      </label>
                      <select
                        value={newDevice.status}
                        onChange={(e) => setNewDevice({ ...newDevice, status: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      >
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Location
                      </label>
                      <input
                        type="text"
                        value={newDevice.location}
                        onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="vrm-btn vrm-btn-secondary"
                        onClick={() => setShowAddDevice(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="vrm-btn">
                        Create Device
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {showEditDevice && editingDevice && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div className="vrm-card" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="vrm-card-header">
                  <h3 className="vrm-card-title">Edit Device</h3>
                </div>
                <div className="vrm-card-body">
                  <form onSubmit={handleEditDevice}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Device Name
                      </label>
                      <input
                        type="text"
                        value={editingDevice.name}
                        onChange={(e) => setEditingDevice({ ...editingDevice, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Status
                      </label>
                      <select
                        value={editingDevice.status}
                        onChange={(e) => setEditingDevice({ ...editingDevice, status: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      >
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)' }}>
                        Location
                      </label>
                      <input
                        type="text"
                        value={editingDevice.location || ''}
                        onChange={(e) => setEditingDevice({ ...editingDevice, location: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--vrm-bg-tertiary)',
                          border: '1px solid var(--vrm-border-color)',
                          borderRadius: '4px',
                          color: 'var(--vrm-text-primary)'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="vrm-btn vrm-btn-secondary"
                        onClick={() => {
                          setShowEditDevice(false);
                          setEditingDevice(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="vrm-btn">
                        Update Device
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AdminPage;
