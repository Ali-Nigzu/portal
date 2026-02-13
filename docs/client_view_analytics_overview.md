# Client-Facing CCTV Analytics Experience

This document explains how the portal renders the camera-driven dashboard and analytics surfaces for client viewers. It focuses on the data logic behind each KPI, chart, and insight as well as the layout and aesthetic decisions that communicate live occupancy, traffic, and dwell behaviour captured from CCTV track events.

## Data Foundation

Camera events arrive from the `/chart-data` endpoint, which returns entry/exit samples enriched with timestamps, estimated demographics, and an optional intelligence payload. Each event includes the track number assigned by the vision system, the event type, and contextual metadata used for aggregation on the client side. The dashboard fetches these records with credential or view-token aware headers, ensuring the same endpoint powers both authenticated operators and share links.【F:frontend/src/pages/DashboardPage.tsx†L34-L123】

To keep the dashboard and analytics views responsive, the client filters the raw event list per widget. The shared `filterDataByTime` utility applies the selected time window to any chart or KPI before aggregations run, ensuring independent controls for KPIs, the activity board, and analytics modules.【F:frontend/src/pages/DashboardPage.tsx†L125-L140】【F:frontend/src/utils/dataProcessing.ts†L20-L63】

The chart normalisation hook then bins the filtered events into hourly, daily, or weekly buckets. It either accepts the user’s granularity choice or falls back to a recommendation derived from the data span or intelligence hint, meaning a seven-day camera sample defaults to daily buckets while a narrow timeframe stays hourly. Within each bucket the hook counts entries, exits, and net activity, derives a running occupancy figure, and highlights peaks informed by AI-detected busy hours when available.【F:frontend/src/hooks/useChartData.ts†L1-L195】

## Dashboard Page (Client View)

### Page Structure and Styling

The dashboard surfaces sit within cards styled by `VRMTheme.css`, which mirrors the Victron Remote Monitoring dark palette—charcoal backgrounds, luminous accent colours, and crisp border treatments. These provide high contrast against CCTV footage metrics and align with the rest of the portal shell (sidebar, breadcrumb, and controls).【F:frontend/src/styles/VRMTheme.css†L1-L128】

### Key KPI Tiles

Each KPI tile consumes the time-filtered dataset and emphasises one actionable CCTV metric:

* **Current Occupancy** – Uses the most recent chart sample or, if the series is empty, recalculates live occupancy by subtracting exits from entries, presenting the count in a large blue numeral to signal a live camera state.【F:frontend/src/pages/DashboardPage.tsx†L142-L170】【F:frontend/src/utils/dataProcessing.ts†L81-L100】
* **Total Traffic** – Shows the number of camera events during the KPI window (from API summary when available, falling back to local counts) to quantify how many tracked bodies crossed the monitored zone.【F:frontend/src/pages/DashboardPage.tsx†L142-L168】
* **Peak Activity Time** – Labels the busiest bucket, formatting the timestamp based on the active granularity (hour, day, or ISO week) or substituting AI-detected peak-hour metadata when present, helping operators schedule staffing around traffic spikes.【F:frontend/src/pages/DashboardPage.tsx†L170-L213】
* **Average Dwell Time** – Converts dwell minutes from the intelligence payload or computes them from entry/exit pairs, rounding into `xh ym` strings to communicate how long visitors linger under surveillance.【F:frontend/src/pages/DashboardPage.tsx†L213-L216】【F:frontend/src/utils/dataProcessing.ts†L65-L120】

### Interactive Activity Board

The main chart renders a composed Recharts visual that overlays occupancy (gradient area) with stacked activity, entry, and exit bars. Users can toggle each series, export to PNG or CSV, and change granularity via a control strip that also displays the AI-recommended bucket size. Highlight bands draw attention to surge periods, either from intelligence-identified hours or the highest-activity bucket. A dashed reference line plots mean occupancy, giving a baseline for crowd density across the CCTV feed.【F:frontend/src/components/ConfigurableChart.tsx†L1-L210】【F:frontend/src/hooks/useChartData.ts†L139-L195】

### Insight Rail

Below the chart, the insight rail converts intelligence metadata into colour-coded callouts. It summarises peak hours, dwell anomalies, occupancy apex, and dataset coverage, assigning warning tones when thresholds imply crowding concerns. This contextualises the raw charts with narratives that security or operations teams can action quickly.【F:frontend/src/pages/DashboardPage.tsx†L216-L250】【F:frontend/src/components/InsightRail.tsx†L1-L63】

## Analytics Page (Client View)

### Demographic Charts

The analytics landing row splits CCTV-derived demographics into two cards:

* **Gender Distribution** – Processes the filtered events by sex code and converts them into labelled pie sectors, exposing male/female/unknown proportions directly from the camera classifier. Export buttons allow PNG snapshots or CSV sharing with stakeholders.【F:frontend/src/pages/AnalyticsPage.tsx†L92-L164】【F:frontend/src/pages/AnalyticsPage.tsx†L240-L284】
* **Age Distribution** – Aggregates estimated age buckets emitted by the vision model into a bar chart sorted lexically, giving a quick view into who is entering the space. Like the pie, it carries independent time controls and export options for downstream reporting.【F:frontend/src/pages/AnalyticsPage.tsx†L165-L226】【F:frontend/src/pages/AnalyticsPage.tsx†L284-L323】

### Activity Pattern Explorer

The Activity Patterns card offers an area chart that can pivot between hourly, weekday, and monthly slices. Each mode rewrites the dataset into the appropriate bins, showing how CCTV-detected movement changes across the day, week, or season. The area fill keeps the focus on total activity while the underlying logic still tracks entry and exit counts for downstream exports.【F:frontend/src/pages/AnalyticsPage.tsx†L226-L276】【F:frontend/src/pages/AnalyticsPage.tsx†L323-L369】

### FoxESS-Style Advanced Trends

The bottom card mimics energy dashboards with multi-series line charts and chip toggles. It groups events per day, then overlays total activity, entrances, exits, average occupancy, and mean dwell time on dual Y-axes. Operators can switch series on or off to compare camera-derived metrics—e.g., checking whether dwell time correlates with occupancy surges—and export the same dataset. Time filters and exports run independently so analysts can zoom into high-alert periods without disturbing other charts.【F:frontend/src/pages/AnalyticsPage.tsx†L115-L226】【F:frontend/src/pages/AnalyticsPage.tsx†L369-L462】

### Shared Controls and Loading States

Each analytics card renders the standard VRM header actions: granular time selectors, export buttons, and consistent loading/error affordances. If the fetch fails, retry buttons keep the user in flow, while skeleton spinners reassure them during slow CCTV data pulls. The entire page inherits the dark, neon-accent aesthetic defined in `VRMTheme.css`, aligning charts, buttons, and tooltips with the broader control-room look and feel.【F:frontend/src/pages/AnalyticsPage.tsx†L61-L115】【F:frontend/src/styles/VRMTheme.css†L1-L128】

## Key CCTV KPIs Tracked

1. **Live Occupancy** – Real-time headcount derived from entries minus exits, continuously updated per chart bucket and surfaced prominently in the dashboard tiles and the advanced trends chart.【F:frontend/src/pages/DashboardPage.tsx†L142-L170】【F:frontend/src/pages/AnalyticsPage.tsx†L276-L369】
2. **Traffic Volume** – Total number of classified entry/exit events within any selected window, used for KPI tiles and to drive activity aggregates in the charts.【F:frontend/src/pages/DashboardPage.tsx†L142-L168】【F:frontend/src/pages/AnalyticsPage.tsx†L226-L323】
3. **Peak Periods** – Highest-activity time buckets, either calculated locally or flagged by the intelligence payload, guiding staffing and alerting decisions.【F:frontend/src/pages/DashboardPage.tsx†L170-L213】【F:frontend/src/hooks/useChartData.ts†L160-L195】
4. **Average Dwell Time** – Minutes tracked individuals spend in view, computed from matching entry/exit events and plotted on the advanced trends chart for behavioural analysis.【F:frontend/src/utils/dataProcessing.ts†L65-L120】【F:frontend/src/pages/AnalyticsPage.tsx†L276-L462】
5. **Demographic Composition** – Gender and age group distributions predicted by the camera pipeline, supporting marketing or security segmentation from the analytics page.【F:frontend/src/pages/AnalyticsPage.tsx†L165-L323】

## Design Considerations

* **Operational Contrast** – The dark VRM palette ensures video-wall legibility while accent colours map directly to event types (blue for occupancy, green for entries, red for exits), reinforcing CCTV semantics.【F:frontend/src/styles/VRMTheme.css†L1-L128】【F:frontend/src/components/ConfigurableChart.tsx†L21-L110】
* **Independent Filters** – Every card owns its own time filter state, enabling simultaneous deep dives (e.g., last 24 hours for dwell versus last 30 days for demographics) without resetting other analyses.【F:frontend/src/pages/DashboardPage.tsx†L37-L138】【F:frontend/src/pages/AnalyticsPage.tsx†L46-L115】
* **Actionable Narratives** – Insight rails and consistent tooltip styling translate raw counts into language that security, retail, or facilities teams can apply immediately, highlighting anomalies alongside the visuals.【F:frontend/src/components/InsightRail.tsx†L1-L63】【F:frontend/src/components/ConfigurableChart.tsx†L110-L210】
* **Export-Friendly** – PNG/CSV buttons across charts support evidence sharing in reports or incident reviews, maintaining parity with the dataset currently filtered on-screen.【F:frontend/src/components/ConfigurableChart.tsx†L150-L210】【F:frontend/src/pages/AnalyticsPage.tsx†L240-L462】

Together these patterns present a cohesive, camera-native analytics experience where every chart, KPI, and insight is grounded in the same stream of tracked entry and exit events, tuned for both monitoring and forensic review.
