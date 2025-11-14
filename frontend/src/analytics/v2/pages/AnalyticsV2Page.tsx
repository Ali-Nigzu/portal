import { useEffect, useMemo, useRef, useState } from 'react';
import { FEATURE_FLAGS, ANALYTICS_V2_TRANSPORT } from '../../../config';
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

export const AnalyticsV2Page = () => {
  const presets = useMemo(() => listPresets(), []);
  const presetMap = useMemo(() => buildPresetMap(presets), [presets]);
  const defaultPresetId = presets[0]?.id ?? null;
  const defaultPreset = defaultPresetId ? presetMap[defaultPresetId] ?? null : null;
  const defaultOverrides = useMemo(
    () => (defaultPreset ? buildDefaultOverrides(defaultPreset) : {}),
    [defaultPreset],
  );
  const [state, dispatch] = useWorkspaceStore(defaultPreset, defaultOverrides, ANALYTICS_V2_TRANSPORT);
  const [runNonce, setRunNonce] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [legendVisibility, setLegendVisibility] = useState<SeriesVisibilityMap | null>(null);
  const sessionAnchorRef = useRef<Date>(new Date());

  const activePreset = state.activePresetId ? presetMap[state.activePresetId] : undefined;
  const effectiveSpec = useMemo(() => {
    if (!activePreset) {
      return undefined;
    }
    return buildSpecWithOverrides(activePreset, state.overrides, sessionAnchorRef.current);
  }, [activePreset, state.overrides]);

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
          state.transportMode,
          controller.signal,
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
  }, [activePreset, effectiveSpec, dispatch, state.transportMode, runNonce]);

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

  const parameterBadges = useMemo(
    () => buildParameterBadges(activePreset, state.overrides),
    [activePreset, state.overrides],
  );

  const hasSeries = Boolean(state.result && state.result.series.length > 0);
  const showPartialWarning = Boolean(state.diagnostics?.partialData);

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
      {activePreset?.overrides.timeRangeOptions ? (
        <TimeControls
          options={activePreset.overrides.timeRangeOptions}
          selectedId={state.overrides.timeRangeId}
          onSelect={(optionId) =>
            dispatch({ type: 'UPDATE_OVERRIDES', overrides: { timeRangeId: optionId } })
          }
        />
      ) : null}
      {activePreset?.overrides.splitToggle ? (
        <SplitToggleControl
          label={activePreset.overrides.splitToggle.label}
          enabled={state.overrides.splitEnabled ?? activePreset.overrides.splitToggle.enabledByDefault}
          onToggle={(enabled) =>
            dispatch({ type: 'UPDATE_OVERRIDES', overrides: { splitEnabled: enabled } })
          }
        />
      ) : null}
      {activePreset?.overrides.measureOptions ? (
        <MeasureControls
          options={activePreset.overrides.measureOptions}
          selectedId={state.overrides.measureOptionId}
          onSelect={(measureOptionId) =>
            dispatch({ type: 'UPDATE_OVERRIDES', overrides: { measureOptionId } })
          }
        />
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

export default AnalyticsV2Page;
