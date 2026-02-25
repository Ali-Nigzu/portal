import React from 'react';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { loadEmptyWidgetResult } from '../features/dashboard/transport/loadEmptyWidgetResult';

const AuthDashboardPage: React.FC = () => (
  <DashboardPage
    credentials={{ username: '', password: '' }}
    widgetResultLoader={loadEmptyWidgetResult}
  />
);

export default AuthDashboardPage;
