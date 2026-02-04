import React from "react";
import NavRow, { NavRowProps } from "./NavRow";

export type SecondaryPinnedRowProps = NavRowProps;

const SecondaryPinnedRow: React.FC<SecondaryPinnedRowProps> = (props) => (
  <NavRow {...props} className={["vrm-secondary-pinned", props.className].filter(Boolean).join(" ")} />
);

export default SecondaryPinnedRow;
