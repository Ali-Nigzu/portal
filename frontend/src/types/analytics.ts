export interface IntelligencePayload {
  total_records: number;
  date_span_days: number;
  latest_timestamp: string | null;
  optimal_granularity: string;
  peak_hours?: number[];
  demographics_breakdown?: Record<string, unknown>;
  temporal_patterns?: Record<string, unknown>;
  avg_dwell_minutes?: number;
}

export type GranularityOption =
  | 'auto'
  | '5m'
  | '15m'
  | 'hour'
  | 'day'
  | 'week'
  | 'hourly'
  | 'daily'
  | 'weekly';
