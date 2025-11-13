import type { ReactNode } from "react";
import "./Card.css";

interface CardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onOpenSettings?: () => void;
  onExport?: () => void;
  dateSelector?: ReactNode;
  tags?: string[];
  footer?: ReactNode;
  className?: string;
}

export const Card = ({
  title,
  subtitle,
  children,
  onOpenSettings,
  onExport,
  dateSelector,
  tags,
  footer,
  className,
}: CardProps) => {
  return (
    <div className={`analytics-card ${className ?? ""}`}>
      <header className="analytics-card__header">
        <div className="analytics-card__title-group">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="analytics-card__controls">
          {dateSelector ? (
            <div className="analytics-card__date-selector">{dateSelector}</div>
          ) : (
            <div className="analytics-card__date-selector placeholder">Date range</div>
          )}
          <div className="analytics-card__actions">
            <button type="button" onClick={onOpenSettings} aria-label="Open settings">
              ⚙️
            </button>
            <button type="button" onClick={onExport} aria-label="Export">
              ⬇️
            </button>
          </div>
        </div>
      </header>
      {tags && tags.length > 0 ? (
        <div className="analytics-card__tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      <div className="analytics-card__body">{children}</div>
      {footer ? <footer className="analytics-card__footer">{footer}</footer> : null}
    </div>
  );
};
