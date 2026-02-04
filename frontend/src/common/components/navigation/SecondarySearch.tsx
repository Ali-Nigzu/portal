import React from "react";
import { Search } from "lucide-react";
import { NavIcon } from "../icons";

const SecondarySearch: React.FC = () => (
  <div className="vrm-secondary-search">
    <span className="vrm-secondary-search__icon" aria-hidden="true">
      <NavIcon icon={Search} size={16} strokeWidth={1.6} />
    </span>
    <input type="search" placeholder="Search" aria-label="Search" />
  </div>
);

export default SecondarySearch;
