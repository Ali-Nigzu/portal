import React, { useState, useEffect } from 'react';

interface User {
  name: string;
  role: 'client' | 'admin';
  csv_url?: string;
  last_login?: string | null;
}

interface AdminPageProps {
  credentials: { username: string; password: string };
}

const AdminPage: React.FC<AdminPageProps> = ({ credentials }) => {
  const [users, setUsers] = useState<{ [key: string]: User }>({});
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
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

  const formatRelativeTime = (timestamp: string | null | undefined): string => {
    if (!timestamp) return 'Never logged in';
    
    const now = new Date();
    const loginDate = new Date(timestamp);
    const diffMs = now.getTime() - loginDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return loginDate.toLocaleDateString();
  };

  const formatFullTimestamp = (timestamp: string | null | undefined): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const loadAdminData = React.useCallback(async () => {
    try {
      setLoading(true);
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || {});
      } else {
        setAlert({ message: 'Failed to load users', type: 'error' });
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
    
    if (!newUser.username.trim() || !newUser.password.trim() || !newUser.name.trim()) {
      setAlert({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    if (newUser.role === 'client' && newUser.csv_url && !isValidUrl(newUser.csv_url)) {
      setAlert({ message: 'Please enter a valid CSV URL', type: 'error' });
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: newUser.username,
          password: newUser.password,
          name: newUser.name,
          role: newUser.role,
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

    if (editUser.role === 'client' && editUser.csv_url && !isValidUrl(editUser.csv_url)) {
      setAlert({ message: 'Please enter a valid CSV URL', type: 'error' });
      return;
    }

    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const updateData: any = {
        name: editUser.name,
        role: editUser.role,
        csv_url: editUser.role === 'client' ? editUser.csv_url : undefined
      };

      if (editUser.password && editUser.password.trim()) {
        updateData.password = editUser.password;
      }

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
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
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

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const viewClientDashboard = async (username: string) => {
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch('/api/admin/create-view-token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ client_id: username }),
      });

      if (response.ok) {
        const data = await response.json();
        window.open(`/dashboard?view_token=${data.token}`, '_blank');
      } else {
        const error = await response.json();
        setAlert({ message: error.detail || 'Failed to create view token', type: 'error' });
      }
    } catch (err) {
      setAlert({ message: 'Failed to generate view token', type: 'error' });
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
  const adminUsers = Object.entries(users).filter(([_, user]) => user.role === 'admin');
  const totalUsers = Object.keys(users).length;

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
              {Object.values(users).filter(u => u.last_login).length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Active Sessions</p>
          </div>
        </div>
      </div>

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
                  <th>Name</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>Data Source</th>
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
                      <span 
                        title={formatFullTimestamp(user.last_login)}
                        style={{ 
                          color: user.last_login ? 'var(--vrm-text-primary)' : 'var(--vrm-text-muted)',
                          cursor: user.last_login ? 'help' : 'default',
                          fontSize: '13px'
                        }}
                      >
                        {formatRelativeTime(user.last_login)}
                      </span>
                    </td>
                    <td>
                      {user.csv_url ? (
                        <span style={{ color: 'var(--vrm-text-secondary)', fontSize: '12px' }}>
                          {user.csv_url.length > 40 ? user.csv_url.substring(0, 40) + '...' : user.csv_url}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--vrm-text-muted)' }}>-</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {user.role === 'client' && (
                          <button 
                            className="vrm-btn vrm-btn-sm"
                            onClick={() => viewClientDashboard(username)}
                            style={{ backgroundColor: 'var(--vrm-accent-blue)' }}
                          >
                            View Dashboard
                          </button>
                        )}
                        <button 
                          className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                          onClick={() => openEditUser(username)}
                        >
                          Edit
                        </button>
                        <button 
                          className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                          onClick={() => handleDeleteUser(username)}
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
                  Username *
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
                  Password *
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
                  Display Name *
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
                  Role *
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
                    CSV Data Source URL
                  </label>
                  <input
                    type="url"
                    value={newUser.csv_url}
                    onChange={(e) => setNewUser({...newUser, csv_url: e.target.value})}
                    placeholder="https://example.com/data.csv"
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

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
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
          <div style={{
            backgroundColor: 'var(--vrm-bg-secondary)',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            border: '1px solid var(--vrm-border)'
          }}>
            <h3 style={{ color: 'var(--vrm-text-primary)', marginBottom: '20px' }}>Edit User: {editingUser}</h3>
            <form onSubmit={handleEditUser}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                  Display Name *
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
                  New Password (leave empty to keep current)
                </label>
                <input
                  type="password"
                  value={editUser.password}
                  onChange={(e) => setEditUser({...editUser, password: e.target.value})}
                  placeholder="Enter new password or leave empty"
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
                  Role *
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
                    CSV Data Source URL
                  </label>
                  <input
                    type="url"
                    value={editUser.csv_url}
                    onChange={(e) => setEditUser({...editUser, csv_url: e.target.value})}
                    placeholder="https://example.com/data.csv"
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

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
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
      )}
    </div>
  );
};

export default AdminPage;
