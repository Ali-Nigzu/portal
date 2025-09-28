import React, { useState, useEffect } from 'react';

interface User {
  username: string;
  name: string;
  role: 'client' | 'admin';
  csv_url?: string;
}

interface Upload {
  filename: string;
  upload_date: string;
  size: number;
  client?: string;
}

interface AdminPageProps {
  credentials: { username: string; password: string };
}

const AdminPage: React.FC<AdminPageProps> = ({ credentials }) => {
  const [users, setUsers] = useState<{ [key: string]: User }>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Form states
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

  const loadAdminData = React.useCallback(async () => {
    try {
      setLoading(true);
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      
      // Load users
      const usersResponse = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData.users || {});
      }

      // Load uploads
      const uploadsResponse = await fetch('/api/admin/uploads', {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (uploadsResponse.ok) {
        const uploadsData = await uploadsResponse.json();
        setUploads(uploadsData.uploads || []);
      }

    } catch (err) {
      setAlert({ message: `Failed to load admin data: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newUser,
          csv_url: newUser.role === 'client' ? newUser.csv_url : undefined
        }),
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
      const updateData = {
        name: editUser.name,
        role: editUser.role,
        ...(editUser.password && { password: editUser.password }),
        ...(editUser.role === 'client' && { csv_url: editUser.csv_url })
      };

      const response = await fetch(`/api/admin/users/${editingUser}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
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
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`/api/admin/users/${username}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
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

  const handleDeleteUpload = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`/api/admin/uploads/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: 'Upload deleted successfully', type: 'success' });
        loadAdminData();
      } else {
        setAlert({ message: data.error || 'Failed to delete upload', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to delete upload', type: 'error' });
    }
  };

  const openEditUser = (username: string) => {
    const user = users[username];
    if (user) {
      setEditingUser(username);
      setEditUser({
        password: '',
        name: user.name,
        role: user.role,
        csv_url: user.csv_url || ''
      });
      setShowEditUser(true);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setAlert({ message: 'Please select a CSV file', type: 'error' });
      return;
    }

    setUploading(true);
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/uploads', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setAlert({ message: `File "${file.name}" uploaded successfully`, type: 'success' });
        loadAdminData(); // Refresh the uploads list
        
        // Reset file input
        if (event.target) {
          event.target.value = '';
        }
      } else {
        setAlert({ message: data.error || 'Failed to upload file', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to upload file', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
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
  const adminUsers = Object.entries(users).filter(([_, user]) => user.role === 'admin');
  const totalUsers = Object.keys(users).length;

  return (
    <div>
      {/* Page Header */}
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

      {/* Alert */}
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

      {/* System Statistics */}
      <div className="vrm-grid vrm-grid-4" style={{ marginBottom: '24px' }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-blue)', marginBottom: '8px' }}>
              {totalUsers}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Total Users</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-green)', marginBottom: '8px' }}>
              {clientUsers.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Active Clients</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-orange)', marginBottom: '8px' }}>
              {adminUsers.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Administrators</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-purple)', marginBottom: '8px' }}>
              {uploads.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Total Uploads</p>
          </div>
        </div>
      </div>

      {/* User Management */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">👥 User Management</h3>
          <div className="vrm-card-actions">
            <button 
              className="vrm-btn vrm-btn-sm"
              onClick={() => setShowAddUser(true)}
            >
              Add User
            </button>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={loadAdminData}>
              Refresh
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="vrm-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>CSV Data Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(users).map(([username, user]) => (
                  <tr key={username}>
                    <td>
                      <code style={{ 
                        backgroundColor: 'var(--vrm-bg-tertiary)', 
                        padding: '2px 6px', 
                        borderRadius: '3px',
                        fontSize: '12px'
                      }}>
                        {username}
                      </code>
                    </td>
                    <td>{user.name}</td>
                    <td>
                      <div className={`vrm-status ${user.role === 'admin' ? 'vrm-status-warning' : 'vrm-status-online'}`}>
                        <div className="vrm-status-dot"></div>
                        {user.role}
                      </div>
                    </td>
                    <td>
                      {user.csv_url ? (
                        <span style={{ color: 'var(--vrm-text-secondary)', fontSize: '12px' }}>
                          {user.csv_url.length > 50 ? user.csv_url.substring(0, 50) + '...' : user.csv_url}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--vrm-text-muted)' }}>-</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                          onClick={() => openEditUser(username)}
                        >
                          Edit
                        </button>
                        {user.role !== 'admin' && (
                          <button 
                            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                            onClick={() => handleDeleteUser(username)}
                            style={{ color: 'var(--vrm-accent-red)' }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Client Dashboards */}
      {clientUsers.length > 0 && (
        <div className="vrm-card" style={{ marginBottom: '24px' }}>
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">📊 Client Dashboards</h3>
          </div>
          <div className="vrm-card-body">
            <div className="vrm-grid vrm-grid-2">
              {clientUsers.map(([username, user]) => (
                <div key={username} style={{ 
                  padding: '20px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  borderRadius: '8px',
                  border: '1px solid var(--vrm-border)'
                }}>
                  <h4 style={{ color: 'var(--vrm-text-primary)', marginBottom: '8px', fontSize: '16px' }}>
                    {user.name}
                  </h4>
                  <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '12px', marginBottom: '4px' }}>
                    Username: {username}
                  </p>
                  {user.csv_url ? (
                    <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '12px', marginBottom: '16px' }}>
                      CSV: {user.csv_url.length > 40 ? user.csv_url.substring(0, 40) + '...' : user.csv_url}
                    </p>
                  ) : (
                    <p style={{ color: 'var(--vrm-accent-orange)', fontSize: '12px', marginBottom: '16px' }}>
                      No CSV configured
                    </p>
                  )}
                  <button 
                    className="vrm-btn vrm-btn-sm" 
                    style={{ width: '100%' }}
                    onClick={() => window.open(`/dashboard?client_id=${username}`, '_blank')}
                  >
                    View Dashboard
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* File Uploads Management */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">📁 File Uploads ({uploads.length})</h3>
          <div className="vrm-card-actions">
            <label style={{ 
              display: 'inline-block',
              position: 'relative',
              overflow: 'hidden',
              cursor: uploading ? 'not-allowed' : 'pointer'
            }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploading}
                style={{
                  position: 'absolute',
                  left: '-9999px',
                  visibility: 'hidden'
                }}
              />
              <span className={`vrm-btn vrm-btn-sm ${uploading ? 'vrm-btn-secondary' : ''}`} 
                    style={{ 
                      pointerEvents: uploading ? 'none' : 'auto',
                      opacity: uploading ? 0.6 : 1
                    }}>
                {uploading ? 'Uploading...' : 'Upload CSV'}
              </span>
            </label>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={loadAdminData}>
              Refresh
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {uploads.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Upload Date</th>
                    <th>Size</th>
                    <th>Client</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr key={upload.filename}>
                      <td>{upload.filename}</td>
                      <td>{formatDate(upload.upload_date)}</td>
                      <td>{formatFileSize(upload.size)}</td>
                      <td>{upload.client || 'Unknown'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                            onClick={() => window.open(`/api/admin/uploads/${encodeURIComponent(upload.filename)}/download`, '_blank')}
                          >
                            Download
                          </button>
                          <button 
                            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                            onClick={() => handleDeleteUpload(upload.filename)}
                            style={{ color: 'var(--vrm-accent-red)' }}
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
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vrm-text-secondary)' }}>
              No uploads found
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
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
          <div style={{
            backgroundColor: 'var(--vrm-bg-secondary)',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            border: '1px solid var(--vrm-border)'
          }}>
            <h3 style={{ color: 'var(--vrm-text-primary)', marginBottom: '20px' }}>Add New User</h3>
            <form onSubmit={handleAddUser}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Username
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value as 'client' | 'admin'})}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                >
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {newUser.role === 'client' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                    CSV URL (optional)
                  </label>
                  <input
                    type="url"
                    value={newUser.csv_url}
                    onChange={(e) => setNewUser({...newUser, csv_url: e.target.value})}
                    placeholder="https://storage.googleapis.com/..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: 'var(--vrm-bg-tertiary)',
                      border: '1px solid var(--vrm-border)',
                      borderRadius: '6px',
                      color: 'var(--vrm-text-primary)'
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="vrm-btn vrm-btn-secondary"
                  onClick={() => setShowAddUser(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="vrm-btn">
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
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
          <div style={{
            backgroundColor: 'var(--vrm-bg-secondary)',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            border: '1px solid var(--vrm-border)'
          }}>
            <h3 style={{ color: 'var(--vrm-text-primary)', marginBottom: '20px' }}>
              Edit User: {editingUser}
            </h3>
            <form onSubmit={handleEditUser}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Password (leave blank to keep current)
                </label>
                <input
                  type="password"
                  value={editUser.password}
                  onChange={(e) => setEditUser({...editUser, password: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) => setEditUser({...editUser, name: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Role
                </label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({...editUser, role: e.target.value as 'client' | 'admin'})}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--vrm-bg-tertiary)',
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px',
                    color: 'var(--vrm-text-primary)'
                  }}
                >
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editUser.role === 'client' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                    CSV URL (optional)
                  </label>
                  <input
                    type="url"
                    value={editUser.csv_url}
                    onChange={(e) => setEditUser({...editUser, csv_url: e.target.value})}
                    placeholder="https://storage.googleapis.com/..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: 'var(--vrm-bg-tertiary)',
                      border: '1px solid var(--vrm-border)',
                      borderRadius: '6px',
                      color: 'var(--vrm-text-primary)'
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
                  Save Changes
                </button>
              </div>
            </form>
          </div>
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