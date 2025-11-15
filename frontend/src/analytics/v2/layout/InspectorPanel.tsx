import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { AnalyticsTransportMode } from '../../../config';
import type { AnalyticsRunDiagnostics } from '../transport/runAnalytics';

const FOCUSABLE_SELECTORS =
  'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface InspectorPanelProps {
  activePresetTitle?: string;
  transportMode: AnalyticsTransportMode;
  specHash?: string;
  children?: ReactNode;
  status?: string;
  diagnostics?: AnalyticsRunDiagnostics;
  trapFocus?: boolean;
}

export const InspectorPanel = ({
  activePresetTitle,
  transportMode,
  specHash,
  children,
  status,
  diagnostics,
  trapFocus = true,
}: InspectorPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trapFocus) {
      return;
    }
    const node = panelRef.current;
    if (!node) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (!focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', handleKeyDown);
    return () => node.removeEventListener('keydown', handleKeyDown);
  }, [trapFocus]);

  return (
    <div
      className="analyticsV2Inspector"
      role="complementary"
      aria-label="Analytics inspector"
      ref={panelRef}
    >
      <div className="analyticsV2Inspector__section">
        <h4>Preset</h4>
        <div className="analyticsV2Inspector__badge">
          <span>{activePresetTitle ?? 'Select a preset'}</span>
        </div>
      </div>
      <div className="analyticsV2Inspector__section">
        <h4>Transport</h4>
        <div className="analyticsV2Inspector__badge" aria-live="polite">
          <span>{transportMode === 'live' ? 'Live /api/analytics/run' : 'Fixture mode'}</span>
        </div>
      </div>
      {status ? (
        <div className="analyticsV2Inspector__section" aria-live="polite">
          <h4>Run status</h4>
          <div className="analyticsV2Inspector__badge analyticsV2Inspector__badge--status">
            <span>{status}</span>
            {diagnostics?.partialData ? <span className="analyticsV2Inspector__badgeWarning">Partial data</span> : null}
          </div>
        </div>
      ) : null}
      {specHash ? (
        <div className="analyticsV2Inspector__section">
          <h4>Spec hash</h4>
          <code style={{ fontSize: '0.8rem', color: '#a7b1c7' }}>{specHash}</code>
        </div>
      ) : null}
      {children}
    </div>
  );
};
