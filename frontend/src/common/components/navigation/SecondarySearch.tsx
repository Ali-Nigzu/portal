import React from "react";

const SecondarySearch: React.FC = () => (
  <div className="vrm-secondary-search">
    <span className="vrm-secondary-search__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="presentation">
        <path
          d="M15.5 14h-.79l-.28-.27A6 6 0 1 0 14 15.5l.27.28v.79L20 21.49 21.49 20l-5.99-6Zm-5.5 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
          fill="currentColor"
        />
      </svg>
    </span>
    <input type="search" placeholder="Search" aria-label="Search" />
  </div>
);

export default SecondarySearch;
