import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HeatmapCard from '../components/dashboard/HeatmapCard';
import GenderBreakdownCard from '../components/dashboard/GenderBreakdownCard';
import AgeBandsCard from '../components/dashboard/AgeBandsCard';
import DwellHistogramCard from '../components/dashboard/DwellHistogramCard';
import TurnoverOccupancyCard from '../components/dashboard/TurnoverOccupancyCard';
import { API_ENDPOINTS } from '../config';
import { ChartData } from '../utils/dataProcessing';
import { IntelligencePayload } from '../types/analytics';
import { InteractionProvider } from '../context/InteractionContext';

interface ApiResponse {
  data: ChartData[];
  summary: {
    total_records: number;
    filtered_from: number;
    date_range: {
      start: string | null;
      end: string | null;
    };
    latest_timestamp: string | null;
  };
  intelligence: IntelligencePayload | null;
}

interface AnalyticsPageProps {
  credentials: { username: string; password: string };
}

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ credentials }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');

      const queryParams = new URLSearchParams();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (viewToken) {
        queryParams.append('view_token', viewToken);
      } else {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;

        if (clientId) {
          queryParams.append('client_id', clientId);
        }
      }

      const apiUrl = `${API_ENDPOINTS.CHART_DATA}?${queryParams.toString()}`;
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dataset = useMemo(() => data?.data ?? [], [data]);
  const intelligence = data?.intelligence ?? null;

  if (loading) {
    return (
      <div className="vrm-loading-viewport">
        <div className="vrm-card-body--centered">
          <div className="vrm-loading-spinner" />
          <p className="vrm-text-secondary">Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">⚠️ Unable to load analytics</h3>
        </div>
        <div className="vrm-card-body">
          <p className="vrm-text-danger vrm-mb-4">{error}</p>
          <button className="vrm-btn" onClick={fetchData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <InteractionProvider pageKey="analytics">
      <div>
        <div className="vrm-section">
          <div>
            <h1 className="vrm-page-title">Advanced analytics</h1>
            <div className="vrm-breadcrumb">
              <span>Analytics</span>
              <span>›</span>
              <span>Breakdowns</span>
            </div>
          </div>
        </div>

        <section className="vrm-section">
          <div className="vrm-grid vrm-grid-3">
            <HeatmapCard data={dataset} intelligence={intelligence} />
            <GenderBreakdownCard data={dataset} intelligence={intelligence} />
            <AgeBandsCard data={dataset} intelligence={intelligence} />
            <DwellHistogramCard data={dataset} intelligence={intelligence} />
            <TurnoverOccupancyCard data={dataset} intelligence={intelligence} />
          </div>
        </section>
      </div>
    </InteractionProvider>
  );
};

export default AnalyticsPage;
