import React, { useState, useEffect, useCallback } from 'react';
import jsPDF from 'jspdf';
import { API_BASE_URL } from '../config';
import { Credentials } from '../types/credentials';
import type { SnapshotResponse } from '../dashboard/v2/utils/snapshotPayload';
import {
  AGE_BUCKET_LABELS,
  RACE_BUCKET_LABELS,
  SEX_BUCKET_LABELS,
  TIMEFRAME_OPTIONS,
  buildSiteActivityMetrics,
  formatReportDateRange,
  buildVisitorProfileMetrics,
  resolveRollup,
  type ReportTimeframe,
} from './reports/reportUtils';
import { buildSiteFlowBucketLabels, startOfYear } from '../dashboard/v2/utils/siteFlowBuckets';

interface ReportsPageProps {
  credentials?: Credentials;
}

const ReportsPage: React.FC<ReportsPageProps> = ({ credentials }) => {
  const [reportType, setReportType] = useState('site-activity');
  const [timePeriod, setTimePeriod] = useState<ReportTimeframe>('today');
  const [isGenerating, setIsGenerating] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setSnapshotError(null);

      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');

      const params = new URLSearchParams();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };

      if (viewToken) {
        params.append('viewToken', viewToken);
      } else if (clientId) {
        params.append('org', clientId);
      } else {
        throw new Error('Missing view_token or client_id for snapshot lookup.');
      }

      if (!viewToken && credentials) {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/snapshots/latest?${params.toString()}`, { headers });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Snapshot fetch failed: ${response.status} ${text}`);
      }

      const result = await response.json();
      setSnapshot(result as SnapshotResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSnapshotError(message);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const reportTemplates = [
    {
      id: 'site-activity',
      name: 'Site Activity',
      description: 'Entrances, exits, occupancy, and dwell trends for the selected period.',
      type: 'Operational Report'
    },
    {
      id: 'visitor-profile',
      name: 'Visitor Profile',
      description: 'Age, sex, and race distribution across entrances.',
      type: 'Demographics Report'
    },
    {
      id: 'device-performance',
      name: 'System Performance',
      description: 'Camera and sensor status, uptime, and data quality metrics',
      type: 'Technical Report'
    }
  ];

  const parseSnapshotTimestamp = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const formatNumber = (value: number) => value.toLocaleString();

  const inferAllTimeStart = (end: Date, seriesList: number[][]): Date => {
    const maxLength = Math.max(...seriesList.map((series) => series.length), 0);
    if (maxLength <= 0) {
      return startOfYear(end);
    }
    const endMonthStart = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
    return new Date(endMonthStart.getFullYear(), endMonthStart.getMonth() - (maxLength - 1), 1, 0, 0, 0, 0);
  };

  const drawBarChart = (
    doc: jsPDF,
    valuesA: number[],
    valuesB: number[],
    labels: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { rotateWeekLabels?: boolean; singleSeries?: boolean }
  ) => {
    const maxValue = Math.max(...valuesA, ...valuesB, 0);
    const barCount = labels.length || 1;
    const singleSeries = options?.singleSeries ?? false;
    const rotateWeekLabels = options?.rotateWeekLabels ?? false;
    const axisPaddingLeft = 16;
    const axisPaddingBottom = rotateWeekLabels ? 20 : 10;
    const axisPaddingTop = 4;
    const axisPaddingRight = 4;
    const plotX = x + axisPaddingLeft;
    const plotY = y + axisPaddingTop;
    const plotWidth = Math.max(width - axisPaddingLeft - axisPaddingRight, 1);
    const plotHeight = Math.max(height - axisPaddingTop - axisPaddingBottom, 1);
    const axisY = plotY + plotHeight;
    const barWidth = plotWidth / barCount;
    const seriesGap = barWidth * 0.2;
    const innerWidth = Math.max(barWidth - seriesGap, 1);
    const scale = maxValue > 0 ? plotHeight / maxValue : 0;
    const labelStep = barCount > 12 ? Math.ceil(barCount / 6) : 1;
    const tickCount = 4;

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(plotX, plotY, plotX, axisY);
    doc.line(plotX, axisY, plotX + plotWidth, axisY);

    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    for (let tick = 0; tick <= tickCount; tick += 1) {
      const value = (maxValue / tickCount) * tick;
      const tickY = axisY - (value / (maxValue || 1)) * plotHeight;
      doc.line(plotX - 1.5, tickY, plotX, tickY);
      doc.text(formatNumber(Math.round(value)), plotX - 2.5, tickY + 1.5, { align: 'right' });
    }

    labels.forEach((label, index) => {
      const baseX = plotX + index * barWidth;
      const valueA = valuesA[index] ?? 0;
      const valueB = valuesB[index] ?? 0;
      const barHeightA = valueA * scale;
      const barHeightB = valueB * scale;

      doc.setFillColor(33, 150, 243);
      if (singleSeries) {
        doc.rect(baseX + seriesGap / 2, axisY - barHeightA, innerWidth, barHeightA, 'F');
      } else {
        doc.rect(baseX + seriesGap / 2, axisY - barHeightA, innerWidth / 2, barHeightA, 'F');
        doc.setFillColor(120, 144, 156);
        doc.rect(baseX + seriesGap / 2 + innerWidth / 2, axisY - barHeightB, innerWidth / 2, barHeightB, 'F');
      }
      if (index % labelStep === 0) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        if (rotateWeekLabels) {
          doc.text(label, baseX + barWidth / 2, axisY + 12, {
            align: 'center',
            angle: 90,
            baseline: 'top',
          });
        } else {
          doc.text(label, baseX + barWidth / 2, axisY + 5, { align: 'center' });
        }
      }
    });
  };

  const drawLineChart = (
    doc: jsPDF,
    values: number[],
    labels: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { rotateWeekLabels?: boolean }
  ) => {
    const maxValue = Math.max(...values, 0);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;
    const rotateWeekLabels = options?.rotateWeekLabels ?? false;
    const axisPaddingLeft = 16;
    const axisPaddingBottom = rotateWeekLabels ? 20 : 10;
    const axisPaddingTop = 4;
    const axisPaddingRight = 4;
    const plotX = x + axisPaddingLeft;
    const plotY = y + axisPaddingTop;
    const plotWidth = Math.max(width - axisPaddingLeft - axisPaddingRight, 1);
    const plotHeight = Math.max(height - axisPaddingTop - axisPaddingBottom, 1);
    const axisY = plotY + plotHeight;
    const step = values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;
    const labelStep = labels.length > 12 ? Math.ceil(labels.length / 6) : 1;
    const tickCount = 4;

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(plotX, plotY, plotX, axisY);
    doc.line(plotX, axisY, plotX + plotWidth, axisY);

    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    for (let tick = 0; tick <= tickCount; tick += 1) {
      const value = minValue + (range / tickCount) * tick;
      const tickY = axisY - ((value - minValue) / range) * plotHeight;
      doc.line(plotX - 1.5, tickY, plotX, tickY);
      doc.text(formatNumber(Math.round(value)), plotX - 2.5, tickY + 1.5, { align: 'right' });
    }

    doc.setDrawColor(33, 150, 243);
    doc.setLineWidth(0.6);
    values.forEach((value, index) => {
      if (index === 0) {
        return;
      }
      const prevValue = values[index - 1] ?? 0;
      const x1 = plotX + (index - 1) * step;
      const y1 = axisY - ((prevValue - minValue) / range) * plotHeight;
      const x2 = plotX + index * step;
      const y2 = axisY - ((value - minValue) / range) * plotHeight;
      doc.line(x1, y1, x2, y2);
    });

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    labels.forEach((label, index) => {
      if (index % labelStep !== 0) {
        return;
      }
      const labelX = plotX + index * step;
      if (rotateWeekLabels) {
        doc.text(label, labelX, axisY + 12, { align: 'center', angle: 90, baseline: 'top' });
      } else {
        doc.text(label, labelX, axisY + 5, { align: 'center' });
      }
    });
  };

  const drawKpiTile = (doc: jsPDF, label: string, value: string, x: number, y: number) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, 45, 22, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, y, 45, 22);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + 3, y + 7);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(value, x + 3, y + 16);
  };

  const generatePDFReport = () => {
    if (!snapshot) {
      alert('Snapshot data is not available yet.');
      return;
    }
    if (!Array.isArray(snapshot.payload) || !Array.isArray(snapshot.payload[7])) {
      alert('Snapshot payload is missing legacy rollup data.');
      return;
    }

    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const template = reportTemplates.find(t => t.id === reportType);
      const snapshotTs = parseSnapshotTimestamp(snapshot.ts);
      const now = new Date();
      const headerEnd = snapshotTs.getTime() <= now.getTime() ? snapshotTs : now;
      const rollup = resolveRollup(snapshot.payload ?? [], timePeriod);
      let headerStartOverride: Date | undefined;

      if (reportType === 'site-activity' && timePeriod === 'all_time') {
        const metricsForHeader = buildSiteActivityMetrics(rollup);
        headerStartOverride = inferAllTimeStart(headerEnd, [
          metricsForHeader.entrancesSeries,
          metricsForHeader.exitsSeries,
          metricsForHeader.footfallSeries,
          metricsForHeader.occupancySeries,
          metricsForHeader.dwellSeries,
        ]);
      }

      if (reportType === 'visitor-profile' && timePeriod === 'all_time') {
        const visitorMetricsForHeader = buildVisitorProfileMetrics(rollup);
        headerStartOverride = inferAllTimeStart(headerEnd, [
          visitorMetricsForHeader.agePct,
          visitorMetricsForHeader.sexPct,
          visitorMetricsForHeader.racePct,
        ]);
      }

      const { subtitle } = formatReportDateRange(snapshotTs, timePeriod, now, headerStartOverride);

      doc.setFontSize(22);
      doc.setTextColor(33, 150, 243);
      doc.text('camOS', 105, 18, { align: 'center' });

      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`${template?.name ?? 'Report'} Report`, 105, 30, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 37, { align: 'center' });
      doc.text(subtitle, 105, 43, { align: 'center' });

      doc.setDrawColor(220, 220, 220);
      doc.line(20, 48, 190, 48);

      if (reportType === 'site-activity') {
        const metrics = buildSiteActivityMetrics(rollup);
        const bucketLabels = buildSiteFlowBucketLabels(
          timePeriod,
          snapshotTs,
          [
            metrics.entrancesSeries,
            metrics.exitsSeries,
            metrics.footfallSeries,
            metrics.occupancySeries,
            metrics.dwellSeries,
          ],
        ).labels;
        const footfallSeries = bucketLabels.length > 0
          ? metrics.footfallSeries.slice(0, bucketLabels.length)
          : metrics.footfallSeries;
        const rotateWeekLabels = bucketLabels.some((label) => {
          const normalized = label.toLowerCase();
          return normalized.startsWith('week of ') || normalized.startsWith('wk of ');
        });

        const margin = 20;
        const contentWidth = 170;
        const chartHeight = 44;
        const chartGap = 10;
        const titleHeight = 6;
        const legendHeight = 6;
        const axisPaddingBottom = 10;
        const axisPaddingTop = 4;
        const chartBlockHeight = titleHeight + legendHeight + axisPaddingTop + chartHeight + axisPaddingBottom;
        const pageHeight = doc.internal.pageSize.getHeight();
        const bottomMargin = 20;
        const ensureSpace = (requiredHeight: number, cursorY: number): number => {
          if (cursorY + requiredHeight <= pageHeight - bottomMargin) {
            return cursorY;
          }
          doc.addPage();
          return margin;
        };

        drawKpiTile(doc, 'Total Entrances', formatNumber(metrics.totalEntrances), 20, 55);
        drawKpiTile(doc, 'Total Exits', formatNumber(metrics.totalExits), 67, 55);
        drawKpiTile(doc, 'Avg Occupancy', formatNumber(metrics.occupancyAvg), 114, 55);
        drawKpiTile(doc, 'Peak Occupancy', formatNumber(metrics.occupancyMax), 161, 55);
        drawKpiTile(doc, 'Avg Dwell (min)', formatNumber(metrics.dwellAvg), 20, 80);

        let chartCursorY = 106;

        chartCursorY = ensureSpace(chartBlockHeight, chartCursorY);
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Footfall', margin, chartCursorY + titleHeight);
        if (footfallSeries.length === 0) {
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          doc.text(
            'No data available.',
            margin + contentWidth / 2,
            chartCursorY + titleHeight + legendHeight + chartHeight / 2,
            { align: 'center' },
          );
        } else {
          drawBarChart(
            doc,
            footfallSeries,
            [],
            bucketLabels,
            margin,
            chartCursorY + titleHeight + legendHeight,
            contentWidth,
            chartHeight + axisPaddingBottom + axisPaddingTop,
            { rotateWeekLabels, singleSeries: true },
          );
        }
        chartCursorY += chartBlockHeight + chartGap;

        chartCursorY = ensureSpace(chartBlockHeight, chartCursorY);
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Occupancy', margin, chartCursorY + titleHeight);
        drawLineChart(
          doc,
          metrics.occupancySeries,
          bucketLabels,
          margin,
          chartCursorY + titleHeight + legendHeight,
          contentWidth,
          chartHeight + axisPaddingBottom + axisPaddingTop,
          { rotateWeekLabels },
        );
        chartCursorY += chartBlockHeight + chartGap;

        if (metrics.dwellSeries.length > 0) {
          chartCursorY = ensureSpace(chartBlockHeight, chartCursorY);
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text('Dwell (minutes)', margin, chartCursorY + titleHeight);
          drawLineChart(
            doc,
            metrics.dwellSeries,
            bucketLabels,
            margin,
            chartCursorY + titleHeight + legendHeight,
            contentWidth,
            chartHeight + axisPaddingBottom + axisPaddingTop,
            { rotateWeekLabels },
          );
          chartCursorY += chartBlockHeight + chartGap;
        }

        let yPos = chartCursorY;
        const tableRowHeight = 4.5;
        const tableHeaderHeight = 11;
        const tableHeightEstimate = tableHeaderHeight + bucketLabels.length * tableRowHeight + 8;
        yPos = ensureSpace(tableHeightEstimate, yPos);
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Bucket summary', margin, yPos);
        yPos += 6;

        const tableHeaders = ['Bucket', 'Entrances', 'Exits', 'Occupancy', 'Dwell', 'Notes'];
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        tableHeaders.forEach((header, index) => {
          doc.text(header, margin + index * 28, yPos);
        });
        yPos += 5;

        bucketLabels.forEach((label, index) => {
          if (yPos > pageHeight - bottomMargin) {
            doc.addPage();
            yPos = margin;
          }
          if (index === metrics.peakOccupancyBucket) {
            doc.setFillColor(227, 242, 253);
            doc.rect(margin - 2, yPos - 3.5, contentWidth + 4, 5, 'F');
          } else if (index % 2 === 1) {
            doc.setFillColor(245, 247, 250);
            doc.rect(margin - 2, yPos - 3.5, contentWidth + 4, 5, 'F');
          }
          const notes: string[] = [];
          if (index === metrics.peakEntrancesBucket) {
            notes.push('Peak Entrances');
          }
          if (index === metrics.peakOccupancyBucket) {
            notes.push('Peak Occupancy');
          }
          if (index === metrics.peakDwellBucket) {
            notes.push('Peak Dwell');
          }
          const row = [
            label,
            formatNumber(metrics.entrancesSeries[index] ?? 0),
            formatNumber(metrics.exitsSeries[index] ?? 0),
            formatNumber(metrics.occupancySeries[index] ?? 0),
            formatNumber(metrics.dwellSeries[index] ?? 0),
            notes.join(', '),
          ];
          row.forEach((value, colIndex) => {
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.text(String(value), margin + colIndex * 28, yPos);
          });
          yPos += 4.5;
        });

      } else if (reportType === 'visitor-profile') {
        const metrics = buildVisitorProfileMetrics(rollup);

        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Visitor Profile Report', 20, 60);
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(`Based on ${formatNumber(metrics.totalEntrances)} entrances in this period.`, 20, 66);

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Age distribution', 20, 78);
        drawBarChart(
          doc,
          metrics.agePct,
          [],
          AGE_BUCKET_LABELS,
          20,
          82,
          80,
          26,
        );

        doc.text('Sex split', 110, 78);
        drawBarChart(
          doc,
          metrics.sexPct,
          [],
          SEX_BUCKET_LABELS,
          110,
          82,
          80,
          26,
        );

        doc.text('Race split', 20, 122);
        drawBarChart(
          doc,
          metrics.racePct,
          [],
          RACE_BUCKET_LABELS,
          20,
          126,
          80,
          26,
        );

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Summary', 110, 122);
        doc.setFontSize(9);
        doc.text(`Top age bucket: ${metrics.dominantAgeBucket}`, 110, 130);
        doc.text(`Sex split: ${metrics.sexSplit.Male}% / ${metrics.sexSplit.Female}%`, 110, 136);
        doc.text(
          `Race split: ${metrics.raceSplit.Light}% / ${metrics.raceSplit.Mix}% / ${metrics.raceSplit.Dark}%`,
          110,
          142,
        );

        if (metrics.totalEntrances === 0) {
          doc.setTextColor(120, 120, 120);
          doc.text('No entrances in this period.', 20, 164);
        }
      } else {
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('System performance data is not available in snapshot reports.', 20, 80);
      }

      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
        doc.text('Confidential - camOS Business Intelligence', 105, 285, { align: 'center' });
      }

      const filename = `${template?.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF report');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = () => {
    if (reportType === 'device-performance') {
      alert('Not available');
      return;
    }
    generatePDFReport();
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Reports
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Reports</span>
        </div>
      </div>

      {/* Report Configuration */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Report Configuration</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-2">
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Report Type
              </label>
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                {reportTemplates.map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Time Period
              </label>
              <select 
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value as ReportTimeframe)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                {TIMEFRAME_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button 
              className="vrm-btn" 
              style={{ flex: 1 }}
              onClick={handleGenerateReport}
              disabled={isGenerating || loading}
            >
              {isGenerating ? 'Generating...' : 'Generate & Download Report'}
            </button>
          </div>
          {snapshotError && (
            <div style={{ marginTop: '12px', color: 'var(--vrm-accent-red)', fontSize: '12px' }}>
              {snapshotError}
            </div>
          )}
        </div>
      </div>

      {/* Report Templates */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Reports</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-2">
            {reportTemplates.map((template) => (
              <div key={template.id} style={{ 
                padding: '20px', 
                backgroundColor: reportType === template.id ? 'rgba(33, 150, 243, 0.1)' : 'var(--vrm-bg-tertiary)', 
                borderRadius: '8px',
                border: `1px solid ${reportType === template.id ? 'var(--vrm-accent-blue)' : 'var(--vrm-border)'}`,
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onClick={() => setReportType(template.id)}
              onMouseEnter={(e) => {
                if (reportType !== template.id) {
                  e.currentTarget.style.borderColor = 'var(--vrm-accent-blue)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (reportType !== template.id) {
                  e.currentTarget.style.borderColor = 'var(--vrm-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ color: 'var(--vrm-text-primary)', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                    {template.name}
                  </h4>
                  <span className="vrm-status vrm-status-online" style={{ fontSize: '11px', marginTop: '4px' }}>
                    {template.type}
                  </span>
                </div>
                
                <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px', marginBottom: '0', lineHeight: '1.5' }}>
                  {template.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
