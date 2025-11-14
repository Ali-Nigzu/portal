import type { ReactNode } from 'react';
import '../styles/WorkspaceShell.css';

interface WorkspaceShellProps {
  leftRail: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
}

export const WorkspaceShell = ({ leftRail, canvas, inspector }: WorkspaceShellProps) => {
  return (
    <div className="analyticsV2Shell">
      <aside className="analyticsV2Shell__rail">{leftRail}</aside>
      <section className="analyticsV2Shell__canvas">{canvas}</section>
      <aside className="analyticsV2Shell__inspector">{inspector}</aside>
    </div>
  );
};
