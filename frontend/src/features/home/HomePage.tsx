import React, { useMemo, useState } from "react";
import { Activity, Building2, ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../analytics/components/Card/Card";
import { useAuthenticatedApplication } from "../../context/AuthenticatedApplicationContext";
import { organisationPortalPath, sitePortalPath } from "../organisation-dashboard/authenticatedPortalRoutes";
import { readRecentPortalDestinations } from "../organisation-dashboard/recentPortalDestinations";
import "../dashboard/styles/DashboardPage.css";
import "./HomePage.css";

const HomePage: React.FC = () => {
  const { user, organisations } = useAuthenticatedApplication();
  const [searchValue, setSearchValue] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigate = useNavigate();

  const navigateTo = (path: string, label?: string) => {
    navigate(path);
    if (label) setSearchValue(label);
    setIsSearchFocused(false);
  };

  const searchResults = useMemo(() => {
    if (!isSearchFocused) return [];
    const normalizedInput = searchValue.trim().toLowerCase();
    return organisations.flatMap((organisation) => [
      { label: organisation.name, path: organisationPortalPath(organisation.id, "dashboard") },
      ...organisation.sites.map((site) => ({
        label: `${site.name} · ${organisation.name}`,
        path: sitePortalPath(organisation.id, site.id, "dashboard"),
      })),
    ]).filter((result) => !normalizedInput || result.label.toLowerCase().includes(normalizedInput)).slice(0, 8);
  }, [isSearchFocused, organisations, searchValue]);
  const recent = useMemo(() => readRecentPortalDestinations(organisations), [organisations]);
  const siteCount = useMemo(
    () => organisations.reduce((total, organisation) => total + organisation.sites.length, 0),
    [organisations],
  );

  return (
    <div className="dashboard-v2 home-page">
      <div className="dashboard-v2__content home-page__content">
        <header className="dashboard-v2__header home-page__header">
          <h1 className="home-page__title">Welcome {user.name}</h1>
          <div
            className="home-page__search-wrap"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (event.currentTarget.contains(nextTarget)) {
                return;
              }
              setIsSearchFocused(false);
            }}
          >
            <label className="vrm-secondary-search home-page__search" aria-label="Search installations">
              <span className="vrm-secondary-search__icon" aria-hidden="true">
                <Search />
              </span>
              <input
                type="search"
                placeholder="Search installations"
                value={searchValue}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </label>
            {searchResults.length > 0 && (
              <div className="home-page__search-suggestions" role="listbox" aria-label="Search suggestions">
                {searchResults.map((result) => <button
                  key={result.path}
                  type="button"
                  className="home-page__search-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => navigateTo(result.path, result.label)}
                >
                  {result.label}
                </button>)}
              </div>
            )}
          </div>
        </header>

        <section className="home-page__layout" aria-label="Home modules">
          {organisations.length === 1 ? <button
            type="button"
            className="home-page__card-button home-page__card-button--fleet"
            onClick={() => navigate(organisationPortalPath(organisations[0].id, "alarm-logs"))}
            aria-label="Open Monitor Fleet"
          >
            <Card
              title="Monitor Fleet"
              className="home-page__card home-page__card--interactive home-page__card--compact"
            >
              <div className="home-page__card-body home-page__card-body--icon">
                <span className="home-page__footer-icon" aria-hidden="true"><Activity size={22} /></span>
              </div>
            </Card>
          </button> : <div className="home-page__panel home-page__card-button--fleet">
            <Card title="Monitor Fleet" className="home-page__card home-page__card--interactive home-page__card--compact">
              <div className="home-page__card-body home-page__card-body--links">
                {organisations.map((organisation) => <button key={organisation.id} className="home-page__list-row" onClick={() => navigate(organisationPortalPath(organisation.id, "alarm-logs"))}>
                  <span>{organisation.name}</span><Activity size={18} aria-hidden="true" />
                </button>)}
              </div>
            </Card>
          </div>}

          <div className="home-page__panel home-page__card-button--sites">
            <Card
              title="My Sites"
              className="home-page__card home-page__card--interactive home-page__card--compact"
            >
              <div className="home-page__card-body home-page__card-body--links">
                {organisations.map((organisation) => <div className="home-page__organisation-group" key={organisation.id}>
                  <strong><Building2 size={15} aria-hidden="true" /> {organisation.name}</strong>
                  {organisation.sites.map((site) => <button key={site.id} className="home-page__list-row" onClick={() => navigate(sitePortalPath(organisation.id, site.id, "dashboard"))}>
                    <span>{site.name}</span><ChevronRight size={18} aria-hidden="true" />
                  </button>)}
                  {!organisation.sites.length && <p className="home-page__empty-copy">No Sites connected.</p>}
                </div>)}
              </div>
            </Card>
          </div>

          <div className="home-page__panel home-page__panel--news">
            <Card title="Product News" className="home-page__card home-page__card--news">
              <div className="home-page__card-body" />
            </Card>
          </div>

          <div className="home-page__panel home-page__panel--favorites">
            <Card title="Favourite Sites" className="home-page__card home-page__card--favorites">
              <div className="home-page__card-body home-page__card-body--text">
                <p>{siteCount === 0
                  ? "Favourite Sites will appear here after a Site is connected."
                  : "You don't have any Favorite Sites yet. Get started by marking a Site as favorite from the dashboard page."}
                </p>
              </div>
            </Card>
          </div>

          <div className="home-page__panel home-page__panel--recent">
            <Card title="Recently Viewed" className="home-page__card home-page__card--recent">
              <div className="home-page__card-body home-page__card-body--recent">
                {recent.length ? recent.map((destination) => <button
                  key={`${destination.organisationId}:${destination.siteId ?? "all"}:${destination.module}`}
                  type="button"
                  className="home-page__list-row"
                  onClick={() => navigate(destination.path)}
                >
                  <span>{destination.label}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>) : <p>No recently viewed organisation pages.</p>}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomePage;
