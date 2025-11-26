import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './AdminPanel.css';

function AdminPanel() {
  const { user } = useAuth();
  const [retentionDays, setRetentionDays] = useState(20);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!user || user.username !== 'timco') {
    return <div className="admin-panel-page"><h1>Access Denied</h1><p>You are not authorized to view this page.</p></div>;
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: user.username,
          retentionDays: parseInt(retentionDays)
        })
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(`Success! Retention set to ${data.config.retentionDays} days. Cleanup triggered.`);
      } else {
        setError(data.error || 'Failed to update config');
      }
    } catch (err) {
      setError('Network error');
    }
    setIsLoading(false);
  };

  return (
    <div className="admin-panel-page">
      <div className="card admin-container">
        <h1>🦄 Super Admin Panel</h1>
        <p>Welcome, Timco. Manage global system settings here.</p>
        
        <div className="admin-section">
          <h2>Cleanup Policy</h2>
          <p className="description">
            To keep the repository size manageable, posts older than the specified number of days 
            that have no comments (inactive) will be automatically deleted.
          </p>
          
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Retention Period (Days)</label>
              <input 
                type="number" 
                className="input" 
                value={retentionDays} 
                onChange={(e) => setRetentionDays(e.target.value)}
                min="1"
              />
            </div>
            
            {message && <div className="success-message">{message}</div>}
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save & Run Cleanup'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
