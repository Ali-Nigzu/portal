export interface SiteSummary {
  id: string;
  name: string;
  region?: string;
}

export interface CameraSummary {
  id: string;
  name: string;
  siteId: string;
  zone?: string;
}

export interface EntityCatalogueProvider {
  listSites(): Promise<SiteSummary[]>;
  listCameras(siteId: string): Promise<CameraSummary[]>;
}

const FIXTURE_SITES: SiteSummary[] = [
  { id: 'site_north', name: 'North Flagship', region: 'NA' },
  { id: 'site_eu', name: 'Central Europe', region: 'EU' },
];

const FIXTURE_CAMERAS: CameraSummary[] = [
  { id: 'cam_north_entry', name: 'North Entry', siteId: 'site_north', zone: 'Entry' },
  { id: 'cam_north_floor', name: 'North Floor', siteId: 'site_north', zone: 'Floor' },
  { id: 'cam_eu_entry', name: 'EU Entry', siteId: 'site_eu', zone: 'Entry' },
];

export const fixtureEntityCatalogue: EntityCatalogueProvider = {
  async listSites() {
    return FIXTURE_SITES;
  },
  async listCameras(siteId: string) {
    return FIXTURE_CAMERAS.filter((camera) => camera.siteId === siteId);
  },
};
