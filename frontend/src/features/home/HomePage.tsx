import React, { useEffect, useMemo, useState } from "react";
import { Activity, Building2, ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../analytics/components/Card/Card";
import { fetchMe } from "../auth/transport/me";
import "../dashboard/styles/DashboardPage.css";
import "./HomePage.css";

const ALL_SITES_LABEL = "All Sites";

const HomePage: React.FC = () => {
  const [userName, setUserName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const me = await fetchMe();
        if (me.ok) {
          setUserName(me.data.user.name);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const navigateToAllSitesContext = () => {
    navigate("/sites/all/dashboard?site_menu_expand_once=1");
    setSearchValue(ALL_SITES_LABEL);
    setIsSearchFocused(false);
  };

  const showAllSitesSuggestion = useMemo(() => {
    if (!isSearchFocused) {
      return false;
    }
    const normalizedInput = searchValue.trim().toLowerCase();
    if (!normalizedInput) {
      return true;
    }
    return ALL_SITES_LABEL.toLowerCase().startsWith(normalizedInput);
  }, [isSearchFocused, searchValue]);

  if (isLoading) {
    return null;
  }

  return (
    <div className="dashboard-v2 home-page">
      <div className="dashboard-v2__content home-page__content">
        <header className="dashboard-v2__header home-page__header">
          <h1 className="home-page__title">Welcome {userName}</h1>
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
            {showAllSitesSuggestion && (
              <div className="home-page__search-suggestions" role="listbox" aria-label="Search suggestions">
                <button
                  type="button"
                  className="home-page__search-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={navigateToAllSitesContext}
                >
                  {ALL_SITES_LABEL}
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="home-page__layout" aria-label="Home modules">
          <button
            type="button"
            className="home-page__card-button home-page__card-button--fleet"
            onClick={() => navigate("/sites/all/alarm-logs?panel=sites&expand_once=1")}
            aria-label="Open Monitor Fleet"
          >
            <Card
              title="Monitor Fleet"
              className="home-page__card home-page__card--interactive home-page__card--compact"
            >
              <div className="home-page__card-body home-page__card-body--icon">
                <span className="home-page__footer-icon" aria-hidden="true">
                  <Activity size={22} />
                </span>
              </div>
            </Card>
          </button>

          <button
            type="button"
            className="home-page__card-button home-page__card-button--sites"
            onClick={() => navigate("/sites/all/dashboard?panel=sites&expand_once=1")}
            aria-label="Open My Sites"
          >
            <Card
              title="My Sites"
              className="home-page__card home-page__card--interactive home-page__card--compact"
            >
              <div className="home-page__card-body home-page__card-body--icon">
                <span className="home-page__footer-icon" aria-hidden="true">
                  <Building2 size={22} />
                </span>
              </div>
            </Card>
          </button>

          <div className="home-page__panel home-page__panel--news">
            <Card title="Product News" className="home-page__card home-page__card--news">
              <div className="home-page__card-body" />
            </Card>
          </div>

          <div className="home-page__panel home-page__panel--favorites">
            <Card title="Favourite Sites" className="home-page__card home-page__card--favorites">
              <div className="home-page__card-body home-page__card-body--text">
                <p>
                  You don't have any Favorite Sites yet. Get started by marking a Site as favorite
                  from the dashboard page.
                </p>
              </div>
            </Card>
          </div>

          <div className="home-page__panel home-page__panel--recent">
            <Card title="Recently Viewed" className="home-page__card home-page__card--recent">
              <div className="home-page__card-body home-page__card-body--recent">
                <button
                  type="button"
                  className="home-page__list-row"
                  onClick={navigateToAllSitesContext}
                >
                  <span>{ALL_SITES_LABEL}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomePage;
