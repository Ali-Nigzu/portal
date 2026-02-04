import React from "react";

const SecondarySearch: React.FC = () => (
  <div className="vrm-secondary-search">
    <span className="vrm-secondary-search__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="presentation">
        <circle
          cx="11"
          cy="11"
          r="6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <line
          x1="16.2"
          y1="16.2"
          x2="20"
          y2="20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
    <input type="search" placeholder="Search" aria-label="Search" />
  </div>
);

export default SecondarySearch;
