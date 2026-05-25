import type { SearchEventsResult } from './searchEvents';
import type { EventData } from '../utils/eventTypes';

export const EVENTLOGS_SYNTHETIC_CONTRACT = {
  eventRecordContract: {
    required: ['index', 'track_number', 'event', 'timestamp'],
    optional: ['site_id', 'cam_id', 'camera_id', 'track_id', 'sex', 'age_estimate', 'age_bucket', 'race', 'hour', 'day_of_week', 'date'],
    nullable: ['site_id', 'cam_id', 'camera_id', 'track_id', 'sex', 'age_estimate', 'age_bucket', 'race'],
    fallbackBranches: {
      track: ['track_id', 'track_number'],
      camera: ['cam_id', 'camera_id'],
      age: ['age_bucket', 'age_estimate'],
    },
  },
} as const;

function row(i: number, patch: Partial<EventData> = {}): EventData {
  return {
    index: i + 1,
    site_id: 1,
    cam_id: i % 4,
    camera_id: i % 4,
    track_id: `${7000 + i}`,
    track_number: `T-${7000 + i}`,
    event: i % 2 === 0 ? 'entry' : 'exit',
    timestamp: `2026-05-20 12:${String((10 + i) % 60).padStart(2, '0')}:00`,
    sex: i % 2,
    age_estimate: i % 6,
    age_bucket: i % 6,
    race: i % 3,
    hour: 12,
    day_of_week: 'Wed',
    date: '2026-05-20',
    ...patch,
  };
}

const profiles: Record<string, () => EventData[]> = {
  nominal: () => Array.from({ length: 18 }, (_, i) => row(i)),
  'width-stress': () => Array.from({ length: 24 }, (_, i) => row(i, {
    track_number: `TRACK-WIDTH-STRESS-${i}-ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890-LONG-LONG-LONG`,
    timestamp: `2026-05-20 12:${String((10 + i) % 60).padStart(2, '0')}:00.123456 UTC + synthetic_profile_width_stress`,
  })),
  'null-mix': () => Array.from({ length: 18 }, (_, i) => row(i, {
    track_id: i % 2 ? null : `${7100 + i}`,
    track_number: i % 2 ? `${8100 + i}` : `T-${7100 + i}`,
    cam_id: i % 3 ? null : i % 4,
    camera_id: i % 3 ? i % 4 : null,
    sex: i % 3 === 0 ? null : i % 2,
    age_bucket: i % 4 === 0 ? null : i % 6,
    age_estimate: i % 4 === 0 ? i % 6 : null,
    race: i % 5 === 0 ? null : i % 3,
  })),
  'scroll-stress': () => Array.from({ length: 80 }, (_, i) => row(i, {
    track_number: `TRACK-SCROLL-STRESS-${i}-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789`,
  })),
};

export function syntheticSearchEvents(profile = 'width-stress'): SearchEventsResult {
  const generator = profiles[profile] ?? profiles['width-stress'];
  const events = generator();
  return { events, total: events.length, total_pages: Math.max(1, Math.ceil(events.length / 20)) };
}
