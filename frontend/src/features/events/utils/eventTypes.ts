export interface EventData {
  index: number;
  site_id?: string | number | null;
  cam_id?: string | number | null;
  camera_id?: string | number | null;
  track_id?: string | number | null;
  track_number: string;
  event: string;
  timestamp: string;
  sex: string | number | null;
  age_estimate: string | number | null;
  age_bucket?: string | number | null;
  race?: string | number | null;
  hour: number;
  day_of_week: string;
  date: string;
}
