import React from "react";
import NavRow, { NavRowProps } from "./NavRow";

const SecondaryPinnedRow: React.FC<NavRowProps> = (props) => (
  <NavRow {...props} className={["vrm-secondary-pinned", props.className].filter(Boolean).join(" ")} />
);

export default SecondaryPinnedRow;
