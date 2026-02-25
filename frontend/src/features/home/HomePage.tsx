import React, { useEffect, useState } from "react";
import { Activity, Building2, ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../analytics/components/Card/Card";
import { fetchMe } from "../auth/transport/me";
import "../dashboard/styles/DashboardPage.css";
import "./HomePage.css";

const HomePage: React.FC = () => {
  const [userName, setUserName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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

  if (isLoading) {
    return null;
  }

  return (
    <div className="dashboard-v2 home-page">
      <div className="dashboard-v2__content home-page__content">
        <header className="dashboard-v2__header home-page__header">
          <h1 className="home-page__title">Welcome, {userName}</h1>
          <label className="vrm-secondary-search home-page__search" aria-label="Search installations">
            <span className="vrm-secondary-search__icon" aria-hidden="true">
              <Search />
            </span>
            <input type="search" placeholder="Search installations" readOnly />
          </label>
        </header>

        <section className="home-page__layout" aria-label="Home modules">
          <button
            type="button"
            className="home-page__card-button home-page__card-button--fleet"
            onClick={() => navigate("/sites/all/alarm-logs")}
            aria-label="Open Monitor Fleet"
          >
            <Card title="Monitor Fleet" className="home-page__card home-page__card--interactive">
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
            onClick={() => navigate("/sites/all/dashboard")}
            aria-label="Open My Sites"
          >
            <Card title="My Sites" className="home-page__card home-page__card--interactive">
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
                  You don't have any Sites installations yet. Get started by marking a Site as
                  favorite from the dashboard page.
                </p>
              </div>
            </Card>
          </div>

          <div className="home-page__panel home-page__panel--recent">
            <Card title="Recently Viewed" className="home-page__card home-page__card--recent">
              <div className="home-page__card-body home-page__card-body--recent">
                <div className="home-page__tab-row">
                  <button
                    type="button"
                    className="home-page__tab"
                    onClick={() => navigate("/sites/all/dashboard")}
                  >
                    All Sites
                  </button>
                </div>
                <button
                  type="button"
                  className="home-page__recent-row"
                  onClick={() => navigate("/sites/all/dashboard")}
                >
                  <span>SoEnergy-Site-001</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="home-page__recent-row"
                  onClick={() => navigate("/sites/all/dashboard")}
                >
                  <span>SoEnergy-Site-002</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="home-page__recent-row"
                  onClick={() => navigate("/sites/all/dashboard")}
                >
                  <span>SoEnergy-Site-003</span>
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
