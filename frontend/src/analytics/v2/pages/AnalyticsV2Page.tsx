import { useEffect, useMemo, useRef, useState } from 'react';
import { FEATURE_FLAGS, ANALYTICS_V2_TRANSPORT, type AnalyticsTransportMode } from '../../../config';
import ErrorBoundary from '../../../common/components/ErrorBoundary';
import type { ChartSpec } from '../../schemas/charting';
import { Card } from '../../components/Card';
import { ChartRenderer } from '../../components/ChartRenderer';
import { ChartErrorState } from '../../components/ChartRenderer/ui/ChartErrorState';
import { ChartEmptyState } from '../../components/ChartRenderer/ui/ChartEmptyState';
import type { ValidationIssue } from '../../components/ChartRenderer/validation';
import type { SeriesVisibilityMap } from '../../components/ChartRenderer/managers';
import { triggerExport } from '../../utils/exportChart';
import { WorkspaceShell } from '../layout/WorkspaceShell';
import { LeftRail } from '../layout/LeftRail';
import { InspectorPanel } from '../layout/InspectorPanel';
import { PRESET_GROUPS, listPresets } from '../presets/presetCatalogue';
import type { PresetDefinition } from '../presets/types';
import { runAnalyticsQuery, AnalyticsTransportError } from '../transport/runAnalytics';
import { useWorkspaceStore } from '../state/workspaceStore';
import {
  buildDefaultOverrides,
  buildSpecWithOverrides,
  buildParameterBadges,
} from '../utils/specOverrides';
import { TimeControls } from '../controls/TimeControls';
import { SplitToggleControl } from '../controls/SplitToggleControl';
import { MeasureControls } from '../controls/MeasureControls';
import { SeriesLegendSummary } from '../components/SeriesLegendSummary';
import { useWorkspaceIntegrityChecks } from '../utils/useWorkspaceIntegrityChecks';
import { pinDashboardWidget } from '../../../dashboard/v2/transport/mutateDashboardManifest';
import { determineOrgId } from '../../../dashboard/v2/utils/determineOrgId';

const buildPresetMap = (presets: PresetDefinition[]): Record<string, PresetDefinition> => {
  return presets.reduce<Record<string, PresetDefinition>>((acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  }, {});
};

const buildTransportIssues = (message: string, code?: string): ValidationIssue[] => [
  {
    code: code ?? 'transport_error',
    message,
  },
];

const DASHBOARD_ID = 'dashboard-default';

interface AnalyticsV2PageProps {
  credentials?: { username: string; password: string };
  transportModeOverride?: AnalyticsTransportMode;
}

type PinStatus = 'idle' | 'loading' | 'success' | 'error';

export const AnalyticsV2Page = ({ credentials, transportModeOverride }: AnalyticsV2PageProps) => {
  const presets = useMemo(() => listPresets(), []);
  const presetMap = useMemo(() => buildPresetMap(presets), [presets]);
  const defaultPresetId = presets[0]?.id ?? null;
  const defaultPreset = defaultPresetId ? presetMap[defaultPresetId] ?? null : null;
  const defaultOverrides = useMemo(
    () => (defaultPreset ? buildDefaultOverrides(defaultPreset) : {}),
    [defaultPreset],
  );
  const orgId = useMemo(() => determineOrgId(credentials ?? {}), [credentials]);
  const [state, dispatch] = useWorkspaceStore(
    defaultPreset,
    defaultOverrides,
    transportModeOverride ?? ANALYTICS_V2_TRANSPORT,
  );
  const [runNonce, setRunNonce] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [legendVisibility, setLegendVisibility] = useState<SeriesVisibilityMap | null>(null);
  const sessionAnchorRef = useRef<Date>(new Date());
  const [pinStatus, setPinStatus] = useState<PinStatus>('idle');
  const [pinError, setPinError] = useState<string | null>(null);

  const activePreset = state.activePresetId ? presetMap[state.activePresetId] : undefined;
  const effectiveSpec = useMemo(() => {
    if (!activePreset) {
      return undefined;
    }
    return buildSpecWithOverrides(activePreset, state.overrides, sessionAnchorRef.current);
  }, [activePreset, state.overrides]);

  useEffect(() => {
    setPinStatus('idle');
    setPinError(null);
  }, [state.spec, orgId]);

  useEffect(() => {
    if (!activePreset || !effectiveSpec) {
      return;
    }
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let canceled = false;

    const runPreset = async () => {
      dispatch({ type: 'RUN_START', spec: effectiveSpec });
      try {
        const payload = await runAnalyticsQuery(
          activePreset,
          effectiveSpec,
          {
            mode: state.transportMode,
            signal: controller.signal,
            orgId,
          },
        );
        if (!canceled) {
          dispatch({ type: 'RUN_SUCCESS', payload });
        }
      } catch (error) {
        if (error instanceof AnalyticsTransportError && error.category === 'ABORTED') {
          dispatch({ type: 'RUN_CANCELLED' });
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          dispatch({ type: 'RUN_CANCELLED' });
          return;
        }
        if (!canceled) {
          if (error instanceof AnalyticsTransportError) {
            dispatch({ type: 'RUN_FAILURE', error: error.message, category: error.category });
          } else {
            const message = error instanceof Error ? error.message : 'Unable to load chart';
            dispatch({ type: 'RUN_FAILURE', error: message });
          }
        }
      }
    };

    runPreset();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [activePreset, effectiveSpec, dispatch, orgId, state.transportMode, runNonce]);

  const handlePresetSelect = (presetId: string) => {
    const preset = presetMap[presetId];
    if (!preset) {
      return;
    }
    dispatch({ type: 'SELECT_PRESET', preset, overrides: buildDefaultOverrides(preset) });
    setLegendVisibility(null);
  };

  const handleExport = () => {
    if (!state.result || !state.spec) {
      return;
    }
    triggerExport({ result: state.result, spec: state.spec, specHash: state.specHash });
  };

  const handleResetOverrides = () => {
    if (!activePreset) {
      return;
    }
    dispatch({
      type: 'RESET_OVERRIDES',
      preset: activePreset,
      overrides: buildDefaultOverrides(activePreset),
    });
    setRunNonce((value) => value + 1);
  };

  const handleManualRerun = () => {
    setRunNonce((value) => value + 1);
  };

  const handleCancelRun = () => {
    abortControllerRef.current?.abort();
    dispatch({ type: 'RUN_CANCELLED' });
  };

  const canPinToDashboard = Boolean(FEATURE_FLAGS.dashboardV2 && state.result && state.spec);

  const handlePinToDashboard = async () => {
    if (!canPinToDashboard || !state.result || !state.spec) {
      return;
    }
    const kind = state.result.chartType === 'single_value' ? 'kpi' : 'chart';
    const specClone = JSON.parse(JSON.stringify(state.spec)) as ChartSpec;
    const baseId = state.specHash ?? activePreset?.id ?? 'chart';
    const widgetId = `workspace-${baseId}-${Date.now()}`;
    const gridWidth = state.result.chartType === 'composed_time' ? 12 : 6;
    const gridHeight = state.result.chartType === 'heatmap' ? 10 : 8;

    setPinStatus('loading');
    setPinError(null);

    try {
      await pinDashboardWidget(orgId, DASHBOARD_ID, {
        widget: {
          id: widgetId,
          title: activePreset?.title ?? 'Pinned chart',
          subtitle: activePreset?.description,
          kind,
          inlineSpec: specClone,
          chartSpecId: specClone.id ?? undefined,
          layout: kind === 'chart' ? { grid: { w: gridWidth, h: gridHeight } } : undefined,
          locked: false,
        },
        targetBand: kind === 'kpi' ? 'kpiBand' : 'grid',
        position: 'end',
      });
      setPinStatus('success');
    } catch (error) {
      setPinStatus('error');
      setPinError(error instanceof Error ? error.message : 'Unable to pin to dashboard');
    }
  };

  const parameterBadges = useMemo(
    () => buildParameterBadges(activePreset, state.overrides),
    [activePreset, state.overrides],
  );

  const hasSeries = Boolean(state.result && state.result.series.length > 0);
  const showPartialWarning = Boolean(state.diagnostics?.partialData);
  const presetControlsDisabled = state.transportMode === 'fixtures';
  const presetControlsHint = presetControlsDisabled
    ? 'Preset overrides are disabled while using fixture transport. Switch to live data to edit time ranges, splits, or metrics.'
    : undefined;

  useWorkspaceIntegrityChecks({
    preset: activePreset,
    overrides: state.overrides,
    spec: state.spec,
    badges: parameterBadges,
    anchor: sessionAnchorRef.current,
    result: state.result,
    legendVisibility,
  });

  const loadingSkeleton = state.isLoading ? (
    <div className="analyticsV2Canvas__skeleton" aria-live="polite">
      <div className="analyticsV2Canvas__shimmer" />
    </div>
  ) : null;

  const runtimeIssues = state.error
    ? buildTransportIssues(state.error, state.errorCategory)
    : undefined;

  const canvas = (
    <Card
      title={activePreset?.title ?? 'Analytics workspace'}
      subtitle={activePreset?.description ?? 'Pick a preset from the left to begin'}
      onExport={handleExport}
      tags={parameterBadges}
    >
      <div className="analyticsV2Canvas" aria-busy={state.isLoading} aria-live="polite">
        {loadingSkeleton}
        {showPartialWarning ? (
          <div className="analyticsV2Canvas__notice" role="status">
            Backend returned partial data – coverage still stabilizing.
          </div>
        ) : null}
        {!state.isLoading && state.error ? (
          <ChartErrorState issues={runtimeIssues ?? []} height={420} />
        ) : null}
        {!state.isLoading && !state.error && state.result && hasSeries ? (
          <ChartRenderer
            result={state.result}
            height={480}
            onVisibilityChange={(visibility) => setLegendVisibility(visibility)}
          />
        ) : null}
        {!state.isLoading && !state.error && state.result && !hasSeries ? (
          <ChartEmptyState
            height={420}
            message="No data for this preset and time range. Adjust filters to try again."
          />
        ) : null}
        {!state.isLoading && !state.error && !state.result ? (
          <ChartEmptyState
            height={420}
            message="Choose a preset from the left rail to load analytics."
          />
        ) : null}
      </div>
    </Card>
  );

  const leftRail = (
    <LeftRail
      groups={PRESET_GROUPS}
      presets={presetMap}
      activePresetId={state.activePresetId}
      onSelectPreset={handlePresetSelect}
    />
  );

  const inspector = (
    <InspectorPanel
      activePresetTitle={activePreset?.title}
      transportMode={state.transportMode}
      specHash={state.specHash}
      status={state.isLoading ? 'Querying backend…' : state.result ? 'Ready' : 'Idle'}
      diagnostics={state.diagnostics}
    >
      <div className="analyticsV2Inspector__section">
        <h4>Status</h4>
        <p style={{ margin: 0, color: '#a7b1c7' }} aria-live="polite">
          {state.isLoading && activePreset
            ? 'Querying backend…'
            : state.result
            ? showPartialWarning
              ? 'Partial data'
              : 'Ready'
            : 'Idle'}
        </p>
        <div className="analyticsV2Inspector__actions">
          <button type="button" onClick={handleResetOverrides} disabled={!activePreset}>
            Reset to defaults
          </button>
          {state.isLoading ? (
            <button type="button" onClick={handleCancelRun}>
              Cancel run
            </button>
          ) : (
            <button type="button" onClick={handleManualRerun} disabled={!activePreset}>
              Run again
            </button>
          )}
        </div>
      </div>
      {activePreset ? (
        <div className="analyticsV2Inspector__section">
          <h4>Preset details</h4>
          <p className="analyticsV2Inspector__description">{activePreset.description}</p>
        </div>
      ) : null}
      {presetControlsDisabled ? (
        <div className="analyticsV2Inspector__section" role="note">
          <div className="analyticsV2Inspector__badge analyticsV2Inspector__badge--status">
            Fixture mode: preset controls locked
          </div>
        </div>
      ) : null}
      {activePreset?.overrides.timeRangeOptions ? (
        <TimeControls
          options={activePreset.overrides.timeRangeOptions}
          selectedId={state.overrides.timeRangeId}
          onSelect={(optionId) =>
            dispatch({ type: 'UPDATE_OVERRIDES', overrides: { timeRangeId: optionId } })
          }
          disabled={presetControlsDisabled}
          disabledReason={presetControlsHint}
        />
      ) : null}
      {activePreset?.overrides.splitToggle ? (
        <SplitToggleControl
          label={activePreset.overrides.splitToggle.label}
          enabled={state.overrides.splitEnabled ?? activePreset.overrides.splitToggle.enabledByDefault}
          onToggle={(enabled) =>
            dispatch({ type: 'UPDATE_OVERRIDES', overrides: { splitEnabled: enabled } })
          }
          disabled={presetControlsDisabled}
          disabledReason={presetControlsHint}
        />
      ) : null}
      {activePreset?.overrides.measureOptions ? (
        <MeasureControls
          options={activePreset.overrides.measureOptions}
          selectedId={state.overrides.measureOptionId}
          onSelect={(measureOptionId) =>
            dispatch({ type: 'UPDATE_OVERRIDES', overrides: { measureOptionId } })
          }
          disabled={presetControlsDisabled}
          disabledReason={presetControlsHint}
        />
      ) : null}
      {FEATURE_FLAGS.dashboardV2 ? (
        <div className="analyticsV2Inspector__section">
          <h4>Dashboard</h4>
          <div className="analyticsV2Inspector__actions">
            <button
              type="button"
              onClick={handlePinToDashboard}
              disabled={!canPinToDashboard || pinStatus === 'loading'}
            >
              {pinStatus === 'loading' ? 'Pinning…' : 'Pin to dashboard'}
            </button>
          </div>
          {pinStatus === 'success' ? (
            <div
              className="analyticsV2Inspector__badge analyticsV2Inspector__badge--status"
              aria-live="polite"
            >
              Pinned to dashboard
            </div>
          ) : null}
          {pinStatus === 'error' ? (
            <div
              className="analyticsV2Inspector__badge analyticsV2Inspector__badge--status analyticsV2Inspector__badgeWarning"
              role="alert"
            >
              {pinError ?? 'Unable to pin to dashboard'}
            </div>
          ) : null}
        </div>
      ) : null}
      <SeriesLegendSummary result={state.result} visibility={legendVisibility} />
    </InspectorPanel>
  );

  if (!FEATURE_FLAGS.analyticsV2) {
    return (
      <div className="analyticsV2EmptyState">Analytics workspace is behind a feature flag.</div>
    );
  }

  return <WorkspaceShell leftRail={leftRail} canvas={canvas} inspector={inspector} />;
};

const AnalyticsV2PageWithBoundary = (props: AnalyticsV2PageProps) => (
  <ErrorBoundary name="analytics-workspace" fallbackMessage="Analytics workspace is temporarily unavailable.">
    <AnalyticsV2Page {...props} />
  </ErrorBoundary>
);

export default AnalyticsV2PageWithBoundary;
