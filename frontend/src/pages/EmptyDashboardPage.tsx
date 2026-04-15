import React from 'react';

const EmptyDashboardPage: React.FC = () => (
  <div style={{ padding: 24 }}>
    <h1 style={{ fontSize: 24, marginBottom: 8 }}>Dashboard</h1>
    <p style={{ color: 'var(--text-default)' }}>No data configured yet.</p>
  </div>
);

export default EmptyDashboardPage;
