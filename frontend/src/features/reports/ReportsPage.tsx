import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import { Credentials } from "../../types/credentials";
import {
  AGE_BUCKET_LABELS,
  RACE_BUCKET_LABELS,
  SEX_BUCKET_LABELS,
  TIMEFRAME_OPTIONS,
  type ReportTimeframe,
} from "./utils/reportUtils";
import { isDemoSessionActive } from "../../lib/demoSession";
import { loadReportData, type ReportData } from "./engine/ReportsEngine";
interface ReportsPageProps {
  credentials?: Credentials;
  reportDataLoader?: typeof loadReportData;
}
const ReportsPage: React.FC<ReportsPageProps> = ({
  credentials,
  reportDataLoader,
}) => {
  const [reportType, setReportType] = useState("site-activity");
  const [timePeriod, setTimePeriod] = useState<ReportTimeframe>("today");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [downloadBlockedMessage, setDownloadBlockedMessage] = useState<
    string | null
  >(null);
  const isDemoMode = isDemoSessionActive();
  const location = useLocation();
  const reportTemplates = [
    {
      id: "site-activity",
      name: "Site Activity",
      description: "Entrances, exits, occupancy, and dwell trends",
      type: "Operational Report",
    },
    {
      id: "visitor-profile",
      name: "Visitor Profile",
      description: "Age, sex, and race distribution across entrances.",
      type: "Demographics Report",
    },
  ];
  const formatNumber = (value: number) => value.toLocaleString();
  const drawBarChart = (
    doc: jsPDF,
    valuesA: number[],
    valuesB: number[],
    labels: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { rotateWeekLabels?: boolean; singleSeries?: boolean },
  ) => {
    const maxValue = Math.max(...valuesA, ...valuesB, 0);
    const barCount = labels.length || 1;
    const singleSeries = options?.singleSeries ?? false;
    const rotateWeekLabels = options?.rotateWeekLabels ?? false;
    const axisPaddingLeft = 16;
    const axisPaddingBottom = rotateWeekLabels ? 22 : 10;
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
      doc.text(formatNumber(Math.round(value)), plotX - 2.5, tickY + 1.5, {
        align: "right",
      });
    }
    labels.forEach((label, index) => {
      const baseX = plotX + index * barWidth;
      const valueA = valuesA[index] ?? 0;
      const valueB = valuesB[index] ?? 0;
      const barHeightA = valueA * scale;
      const barHeightB = valueB * scale;
      doc.setFillColor(33, 150, 243);
      if (singleSeries) {
        doc.rect(
          baseX + seriesGap / 2,
          axisY - barHeightA,
          innerWidth,
          barHeightA,
          "F",
        );
      } else {
        doc.rect(
          baseX + seriesGap / 2,
          axisY - barHeightA,
          innerWidth / 2,
          barHeightA,
          "F",
        );
        doc.setFillColor(120, 144, 156);
        doc.rect(
          baseX + seriesGap / 2 + innerWidth / 2,
          axisY - barHeightB,
          innerWidth / 2,
          barHeightB,
          "F",
        );
      }
      if (index % labelStep === 0) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        if (rotateWeekLabels) {
          doc.text(label, baseX + barWidth / 2, axisY + 10, {
            align: "center",
            angle: 50,
            baseline: "top",
          });
        } else {
          doc.text(label, baseX + barWidth / 2, axisY + 5, { align: "center" });
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
    options?: { rotateWeekLabels?: boolean },
  ) => {
    const maxValue = Math.max(...values, 0);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;
    const rotateWeekLabels = options?.rotateWeekLabels ?? false;
    const axisPaddingLeft = 16;
    const axisPaddingBottom = rotateWeekLabels ? 22 : 10;
    const axisPaddingTop = 4;
    const axisPaddingRight = 4;
    const plotX = x + axisPaddingLeft;
    const plotY = y + axisPaddingTop;
    const plotWidth = Math.max(width - axisPaddingLeft - axisPaddingRight, 1);
    const plotHeight = Math.max(height - axisPaddingTop - axisPaddingBottom, 1);
    const axisY = plotY + plotHeight;
    const step =
      values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;
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
      doc.text(formatNumber(Math.round(value)), plotX - 2.5, tickY + 1.5, {
        align: "right",
      });
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
        doc.text(label, labelX, axisY + 10, {
          align: "center",
          angle: 50,
          baseline: "top",
        });
      } else {
        doc.text(label, labelX, axisY + 5, { align: "center" });
      }
    });
  };
  const drawKpiTile = (
    doc: jsPDF,
    label: string,
    value: string,
    x: number,
    y: number,
  ) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, 45, 22, "F");
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, y, 45, 22);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + 3, y + 7);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(value, x + 3, y + 16);
  };
  const generatePDFReport = async () => {
    setIsGenerating(true);
    setReportError(null);
    try {
      const loadData = reportDataLoader ?? loadReportData;
      const reportData: ReportData = await loadData({
        reportType: reportType as ReportData["reportType"],
        timeframe: timePeriod,
        pathname: location.pathname,
        credentials,
      });
      const doc = new jsPDF();
      const template = reportTemplates.find((t) => t.id === reportType);
      const snapshotTs = reportData.snapshotTs;
      const subtitle = reportData.subtitle;
      doc.setFontSize(22);
      doc.setTextColor(33, 150, 243);
      doc.text("camOS", 105, 18, { align: "center" });
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`${template?.name ?? "Report"} Report`, 105, 30, {
        align: "center",
      });
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 37, {
        align: "center",
      });
      doc.text(subtitle, 105, 43, { align: "center" });
      doc.setDrawColor(220, 220, 220);
      doc.line(20, 48, 190, 48);
      if (reportData.reportType === "site-activity") {
        const metrics = reportData.metrics;
        const bucketLabels = reportData.bucketLabels;
        const footfallSeries =
          bucketLabels.length > 0
            ? metrics.footfallSeries.slice(0, bucketLabels.length)
            : metrics.footfallSeries;
        const rotateWeekLabels = bucketLabels.some((label) => {
          const normalized = label.toLowerCase();
          return (
            normalized.startsWith("week of ") || normalized.startsWith("wk of ")
          );
        });
        const margin = 20;
        const contentWidth = 170;
        const chartHeight = 44;
        const chartGap = 10;
        const titleHeight = 6;
        const legendHeight = 6;
        const axisPaddingBottom = 10;
        const axisPaddingTop = 4;
        const chartBlockHeight =
          titleHeight +
          legendHeight +
          axisPaddingTop +
          chartHeight +
          axisPaddingBottom;
        const pageHeight = doc.internal.pageSize.getHeight();
        const bottomMargin = 20;
        const ensureSpace = (
          requiredHeight: number,
          cursorY: number,
        ): number => {
          if (cursorY + requiredHeight <= pageHeight - bottomMargin) {
            return cursorY;
          }
          doc.addPage();
          return margin;
        };
        drawKpiTile(
          doc,
          "Total Entrances",
          formatNumber(metrics.totalEntrances),
          20,
          55,
        );
        drawKpiTile(
          doc,
          "Total Exits",
          formatNumber(metrics.totalExits),
          67,
          55,
        );
        drawKpiTile(
          doc,
          "Avg Occupancy",
          formatNumber(metrics.occupancyAvg),
          114,
          55,
        );
        drawKpiTile(
          doc,
          "Peak Occupancy",
          formatNumber(metrics.occupancyMax),
          161,
          55,
        );
        drawKpiTile(
          doc,
          "Avg Dwell (min)",
          formatNumber(metrics.dwellAvg),
          20,
          80,
        );
        let chartCursorY = 106;
        chartCursorY = ensureSpace(chartBlockHeight, chartCursorY);
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text("Footfall", margin, chartCursorY + titleHeight);
        if (footfallSeries.length > 0) {
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
        doc.text("Occupancy", margin, chartCursorY + titleHeight);
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
          doc.text("Dwell (minutes)", margin, chartCursorY + titleHeight);
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
        const tableHeightEstimate =
          tableHeaderHeight + bucketLabels.length * tableRowHeight + 8;
        yPos = ensureSpace(tableHeightEstimate, yPos);
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text("Bucket summary", margin, yPos);
        yPos += 6;
        const tableHeaders = [
          "Bucket",
          "Entrances",
          "Exits",
          "Occupancy",
          "Dwell",
          "Notes",
        ];
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
            doc.rect(margin - 2, yPos - 3.5, contentWidth + 4, 5, "F");
          } else if (index % 2 === 1) {
            doc.setFillColor(245, 247, 250);
            doc.rect(margin - 2, yPos - 3.5, contentWidth + 4, 5, "F");
          }
          const notes: string[] = [];
          if (index === metrics.peakEntrancesBucket) {
            notes.push("Peak Entrances");
          }
          if (index === metrics.peakOccupancyBucket) {
            notes.push("Peak Occupancy");
          }
          if (index === metrics.peakDwellBucket) {
            notes.push("Peak Dwell");
          }
          const row = [
            label,
            formatNumber(metrics.entrancesSeries[index] ?? 0),
            formatNumber(metrics.exitsSeries[index] ?? 0),
            formatNumber(metrics.occupancySeries[index] ?? 0),
            formatNumber(metrics.dwellSeries[index] ?? 0),
            notes.join(", "),
          ];
          row.forEach((value, colIndex) => {
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.text(String(value), margin + colIndex * 28, yPos);
          });
          yPos += 4.5;
        });
      } else if (reportData.reportType === "visitor-profile") {
        const metrics = reportData.metrics;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text("Visitor Profile Report", 20, 60);
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(
          `Based on ${formatNumber(metrics.totalEntrances)} entrances in this period.`,
          20,
          66,
        );
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text("Age distribution", 20, 78);
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
        doc.text("Sex split", 110, 78);
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
        doc.text("Race split", 20, 122);
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
        doc.text("Summary", 110, 122);
        doc.setFontSize(9);
        doc.text(`Top age bucket: ${metrics.dominantAgeBucket}`, 110, 130);
        doc.text(
          `Sex split: ${metrics.sexSplit.Male}% / ${metrics.sexSplit.Female}%`,
          110,
          136,
        );
        doc.text(
          `Race split: ${metrics.raceSplit.Light}% / ${metrics.raceSplit.Mix}% / ${metrics.raceSplit.Dark}%`,
          110,
          142,
        );
      }
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
        doc.text("Confidential - camOS Business Intelligence", 105, 285, {
          align: "center",
        });
      }
      const filename = `${template?.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setReportError(
        error instanceof Error
          ? error.message
          : "Failed to generate PDF report",
      );
      alert("Failed to generate PDF report");
    } finally {
      setIsGenerating(false);
    }
  };
  const handleGenerateReport = () => {
    if (!isDemoMode) {
      setDownloadBlockedMessage("No Sites Connected");
      return;
    }
    setDownloadBlockedMessage(null);
    void generatePDFReport();
  };
  return (
    <div>
      {" "}
      {}{" "}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            color: "var(--vrm-text-primary)",
            fontSize: "24px",
            fontWeight: "600",
            marginBottom: "8px",
          }}
        >
          {" "}
          Reports{" "}
        </h1>
      </div>{" "}
      {}{" "}
      <div className="vrm-card" style={{ marginBottom: "24px" }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Report Configuration</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-2">
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "var(--vrm-text-secondary)",
                  fontSize: "14px",
                }}
              >
                {" "}
                Type{" "}
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  backgroundColor: "var(--vrm-bg-tertiary)",
                  border: "1px solid var(--vrm-border)",
                  borderRadius: "6px",
                  color: "var(--vrm-text-primary)",
                }}
              >
                {" "}
                {reportTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}{" "}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "var(--vrm-text-secondary)",
                  fontSize: "14px",
                }}
              >
                {" "}
                Period{" "}
              </label>
              <select
                value={timePeriod}
                onChange={(e) =>
                  setTimePeriod(e.target.value as ReportTimeframe)
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  backgroundColor: "var(--vrm-bg-tertiary)",
                  border: "1px solid var(--vrm-border)",
                  borderRadius: "6px",
                  color: "var(--vrm-text-primary)",
                }}
              >
                {" "}
                {TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {" "}
                    {option.label}{" "}
                  </option>
                ))}{" "}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
            <button
              className="vrm-btn"
              style={{ flex: 1 }}
              onClick={handleGenerateReport}
              disabled={isGenerating}
            >
              {" "}
              {isGenerating ? "Generating..." : "Download Report"}{" "}
            </button>
          </div>{" "}
          {reportError && (
            <div
              style={{
                marginTop: "12px",
                color: "#8b3a2f",
                fontSize: "12px",
              }}
            >
              {" "}
              {reportError}{" "}
            </div>
          )}{" "}
          {downloadBlockedMessage && (
            <div
              style={{
                marginTop: "12px",
                color: "var(--vrm-text-secondary)",
                fontSize: "12px",
              }}
            >
              {downloadBlockedMessage}
            </div>
          )}
        </div>
      </div>{" "}
      {}{" "}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Reports</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-2">
            {" "}
            {reportTemplates.map((template) => (
              <div
                key={template.id}
                style={{
                  padding: "20px",
                  backgroundColor:
                    reportType === template.id
                      ? "color-mix(in srgb, var(--signal-gold) 9%, var(--surface-elevated-strong))"
                      : "color-mix(in srgb, var(--surface-panel) 82%, white 18%)",
                  borderRadius: "8px",
                  border: `1px solid ${reportType === template.id ? "var(--vrm-accent-blue)" : "var(--vrm-border)"}`,
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                  position: "relative",
                }}
                onClick={() => {
                  setReportType(template.id);
                }}
                onMouseEnter={(e) => {
                  if (reportType !== template.id) {
                    e.currentTarget.style.borderColor =
                      "color-mix(in srgb, var(--signal-gold) 46%, var(--line-default) 54%)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (reportType !== template.id) {
                    e.currentTarget.style.borderColor = "var(--vrm-border)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                {" "}
                <div style={{ marginBottom: "12px" }}>
                  <h4
                    style={{
                      color: "var(--vrm-text-primary)",
                      margin: 0,
                      fontSize: "16px",
                      fontWeight: "600",
                    }}
                  >
                    {" "}
                    {template.name}{" "}
                  </h4>
                  <span
                    className="vrm-status vrm-status-online"
                    style={{ fontSize: "11px", marginTop: "4px" }}
                  >
                    {" "}
                    {template.type}{" "}
                  </span>
                </div>
                <p
                  style={{
                    color: "var(--vrm-text-secondary)",
                    fontSize: "14px",
                    marginBottom: "0",
                    lineHeight: "1.5",
                  }}
                >
                  {" "}
                  {template.description}{" "}
                </p>
              </div>
            ))}{" "}
          </div>
        </div>
      </div>
    </div>
  );
};
export default ReportsPage;
