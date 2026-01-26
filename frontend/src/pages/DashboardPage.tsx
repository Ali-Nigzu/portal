import React from 'react';

import DashboardV2Page from '../features/dashboard/v2/pages/DashboardV2Page';
import { Credentials } from '../types/credentials';

interface DashboardPageProps {
  credentials: Credentials;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ credentials }) => (
  <DashboardV2Page credentials={credentials} />
);

export default DashboardPage;
