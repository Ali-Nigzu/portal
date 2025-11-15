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
  { id: 'fixture_site_alpha', name: 'Fixture Site Alpha', region: 'NA' },
  { id: 'fixture_site_beta', name: 'Fixture Site Beta', region: 'EU' },
];

const FIXTURE_CAMERAS: CameraSummary[] = [
  { id: 'fixture_cam_alpha_entry', name: 'Fixture Alpha Entry', siteId: 'fixture_site_alpha', zone: 'Entry' },
  { id: 'fixture_cam_alpha_floor', name: 'Fixture Alpha Floor', siteId: 'fixture_site_alpha', zone: 'Floor' },
  { id: 'fixture_cam_beta_entry', name: 'Fixture Beta Entry', siteId: 'fixture_site_beta', zone: 'Entry' },
];

export const fixtureEntityCatalogue: EntityCatalogueProvider = {
  async listSites() {
    return FIXTURE_SITES;
  },
  async listCameras(siteId: string) {
    return FIXTURE_CAMERAS.filter((camera) => camera.siteId === siteId);
  },
};
