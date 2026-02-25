import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "../../analytics/components/Card/Card";
import { fetchMe } from "../auth/transport/me";
import "../dashboard/styles/DashboardPage.css";
import "./HomePage.css";

const HomePage: React.FC = () => {
  const [userName, setUserName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
          <label className="vrm-secondary-search home-page__search" aria-label="Search">
            <span className="vrm-secondary-search__icon" aria-hidden="true">
              <Search />
            </span>
            <input type="search" placeholder="Search" readOnly />
          </label>
        </header>

        <section className="home-page__grid home-page__grid--top" aria-label="Home highlights">
          <Card title="Fleet monitor" className="home-page__card">
            <div className="home-page__card-body" />
          </Card>
          <Card title="My installations" className="home-page__card">
            <div className="home-page__card-body" />
          </Card>
          <Card title="Product news" className="home-page__card">
            <div className="home-page__card-body" />
          </Card>
        </section>

        <section className="home-page__grid home-page__grid--bottom" aria-label="Recent sections">
          <Card title="Favorite installations" className="home-page__card home-page__card--wide">
            <div className="home-page__card-body" />
          </Card>
          <Card title="Recently viewed" className="home-page__card home-page__card--wide">
            <div className="home-page__card-body" />
          </Card>
        </section>
      </div>
    </div>
  );
};

export default HomePage;
