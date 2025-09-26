// Nigzsu Admin Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    refreshUploads();
    updateUploadCount();
});

function setupEventListeners() {
    // Add user form
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
    
    // Edit user form
    document.getElementById('editUserForm').addEventListener('submit', handleEditUser);
    
    // Role change listeners
    document.getElementById('newRole').addEventListener('change', toggleCsvUrlSection);
    document.getElementById('editRole').addEventListener('change', toggleEditCsvUrlSection);
}

function toggleCsvUrlSection() {
    const role = document.getElementById('newRole').value;
    const csvSection = document.getElementById('csvUrlSection');
    csvSection.style.display = role === 'client' ? 'block' : 'none';
}

function toggleEditCsvUrlSection() {
    const role = document.getElementById('editRole').value;
    const csvSection = document.getElementById('editCsvUrlSection');
    csvSection.style.display = role === 'client' ? 'block' : 'none';
}

function handleAddUser(e) {
    e.preventDefault();
    
    const userData = {
        username: document.getElementById('newUsername').value,
        password: document.getElementById('newPassword').value,
        name: document.getElementById('newName').value,
        role: document.getElementById('newRole').value,
        csv_url: document.getElementById('newCsvUrl').value || null
    };
    
    fetch('/api/admin/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('User added successfully', 'success');
            location.reload(); // Refresh page to show new user
        } else {
            showAlert(data.error || 'Failed to add user', 'danger');
        }
    })
    .catch(error => {
        console.error('Error adding user:', error);
        showAlert('Failed to add user', 'danger');
    });
}

function editUser(username) {
    // Fetch user data and populate edit form
    fetch(`/api/admin/users/${username}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const user = data.user;
                document.getElementById('editUsername').value = username;
                document.getElementById('editName').value = user.name;
                document.getElementById('editRole').value = user.role;
                document.getElementById('editCsvUrl').value = user.csv_url || '';
                
                toggleEditCsvUrlSection();
                
                const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
                modal.show();
            } else {
                showAlert(data.error || 'Failed to fetch user data', 'danger');
            }
        })
        .catch(error => {
            console.error('Error fetching user:', error);
            showAlert('Failed to fetch user data', 'danger');
        });
}

function handleEditUser(e) {
    e.preventDefault();
    
    const username = document.getElementById('editUsername').value;
    const userData = {
        name: document.getElementById('editName').value,
        role: document.getElementById('editRole').value,
        csv_url: document.getElementById('editCsvUrl').value || null
    };
    
    const password = document.getElementById('editPassword').value;
    if (password) {
        userData.password = password;
    }
    
    fetch(`/api/admin/users/${username}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('User updated successfully', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
            location.reload(); // Refresh page to show changes
        } else {
            showAlert(data.error || 'Failed to update user', 'danger');
        }
    })
    .catch(error => {
        console.error('Error updating user:', error);
        showAlert('Failed to update user', 'danger');
    });
}

function deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }
    
    fetch(`/api/admin/users/${username}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('User deleted successfully', 'success');
            location.reload(); // Refresh page to remove user
        } else {
            showAlert(data.error || 'Failed to delete user', 'danger');
        }
    })
    .catch(error => {
        console.error('Error deleting user:', error);
        showAlert('Failed to delete user', 'danger');
    });
}

function viewClientDashboard(username) {
    // Open client dashboard in new tab with admin privileges
    const url = `/dashboard?client_id=${username}`;
    window.open(url, '_blank');
}

function refreshUploads() {
    fetch('/api/admin/uploads')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateUploadsTable(data.uploads);
                updateUploadCount(data.uploads.length);
            } else {
                console.error('Failed to fetch uploads:', data.error);
                document.getElementById('uploadsTable').innerHTML = 
                    '<tr><td colspan="5" class="text-center text-danger">Failed to load uploads</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error fetching uploads:', error);
            document.getElementById('uploadsTable').innerHTML = 
                '<tr><td colspan="5" class="text-center text-danger">Error loading uploads</td></tr>';
        });
}

function updateUploadsTable(uploads) {
    const tableBody = document.getElementById('uploadsTable');
    
    if (uploads.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No uploads found</td></tr>';
        return;
    }
    
    const rows = uploads.map(upload => `
        <tr>
            <td>${upload.filename}</td>
            <td>${formatDate(upload.upload_date)}</td>
            <td>${formatFileSize(upload.size)}</td>
            <td>${upload.client || 'Unknown'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="downloadUpload('${upload.filename}')">
                    Download
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteUpload('${upload.filename}')">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
    
    tableBody.innerHTML = rows;
}

function updateUploadCount(count) {
    const countElement = document.getElementById('uploadCount');
    if (countElement) {
        countElement.textContent = count !== undefined ? count : '-';
    }
}

function downloadUpload(filename) {
    window.open(`/api/admin/uploads/${encodeURIComponent(filename)}/download`, '_blank');
}

function deleteUpload(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    fetch(`/api/admin/uploads/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Upload deleted successfully', 'success');
            refreshUploads();
        } else {
            showAlert(data.error || 'Failed to delete upload', 'danger');
        }
    })
    .catch(error => {
        console.error('Error deleting upload:', error);
        showAlert('Failed to delete upload', 'danger');
    });
}

function showAlert(message, type) {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Insert at top of container
    const container = document.querySelector('.container-fluid');
    container.insertBefore(alertDiv, container.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}