import type { PresetIconName } from '../presets/types';

interface PresetIconProps {
  name: PresetIconName;
}

const ICON_PATHS: Record<PresetIconName, JSX.Element> = {
  activity: (
    <path
      d="M4 12h2l2.5-5 3 10 3-6H20"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  clock: (
    <>
      <circle
        cx="12"
        cy="12"
        r="8.25"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M12 7.5V12l3 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  layers: (
    <>
      <path
        d="M6 10.5 12 7l6 3.5-6 3.5-6-3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="m6 14 6 3.5 6-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
    </>
  ),
  retention: (
    <>
      <path
        d="M6 10c1.5-3 4.5-3 6 0 1.5 3 4.5 3 6 0"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M6 14h12"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  heatmap: (
    <>
      <rect x="5" y="7" width="3.5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="10.75" y="7" width="3.5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="5" y="12.75" width="3.5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="10.75" y="12.75" width="3.5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </>
  ),
};

export const PresetIcon = ({ name }: PresetIconProps) => {
  return (
    <span className="analyticsV2Preset__icon" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" role="presentation">
        {ICON_PATHS[name]}
      </svg>
    </span>
  );
};
