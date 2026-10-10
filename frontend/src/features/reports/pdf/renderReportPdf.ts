import { jsPDF } from "jspdf";
import type { ReportData } from "../engine/ReportsEngine";
import type { ReportIdentity } from "../types";
import { AGE_BUCKET_LABELS, SEX_BUCKET_LABELS } from "../utils/reportUtils";

const safePart = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "Report";
export function reportFilename(identity: ReportIdentity, title: string) {
  return `${safePart(identity.heading)}-${safePart(title)}-Report.pdf`;
}
const generatedLabel = (date: Date) =>
  date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const reportLayoutSpec = {
  headerAlignment: "center" as const,
  footerBrand: "Camos Reports",
};
export const chartLabelAngle = (data: ReportData) =>
  data.reportType === "site-activity" && data.timeframe === "last_quarter"
    ? 45
    : 0;
export const formatChartValue = (value: number, percentage = false) =>
  `${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}${percentage ? "%" : ""}`;
export function chartPresentation(
  data: ReportData,
  values: number[],
  percentage = false,
) {
  const peak = percentage ? 100 : Math.max(...values, 1);
  return {
    labelAngle: chartLabelAngle(data),
    scaleLabels: [0, peak / 2, peak].map((value) =>
      formatChartValue(value, percentage),
    ),
    valueLabels:
      values.length <= 8
        ? values.map((value) => formatChartValue(value, percentage))
        : [],
  };
}
function bars(
  doc: jsPDF,
  data: ReportData,
  values: number[],
  labels: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  options: { percentage?: boolean; rotateLabels?: boolean } = {},
) {
  const presentation = chartPresentation(data, values, options.percentage);
  const peak = options.percentage ? 100 : Math.max(...values, 1);
  const axisWidth = 12;
  const plotX = x + axisWidth;
  const plotWidth = w - axisWidth;
  const cell = plotWidth / Math.max(values.length, 1);
  doc.setDrawColor(225, 225, 222);
  doc.setFont("helvetica", "normal");
  for (let tick = 0; tick <= 2; tick += 1) {
    const tickValue = (peak / 2) * tick;
    const tickY = y + h - (tick / 2) * (h - 8);
    doc.setLineWidth(0.15);
    doc.line(plotX, tickY, plotX + plotWidth, tickY);
    doc.setFontSize(6.5);
    doc.setTextColor(105);
    doc.text(presentation.scaleLabels[tick], plotX - 2, tickY + 1.5, {
      align: "right",
    });
  }
  values.forEach((value, i) => {
    const bh = (value / peak) * (h - 8);
    const centerX = plotX + i * cell + cell / 2;
    doc.setFillColor(174, 132, 37);
    doc.roundedRect(
      plotX + i * cell + 2,
      y + h - bh,
      Math.max(cell - 4, 2),
      bh,
      1,
      1,
      "F",
    );
    if (presentation.valueLabels.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(55);
      doc.text(presentation.valueLabels[i], centerX, y + h - bh - 2, {
        align: "center",
      });
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    if (options.rotateLabels) {
      doc.text(labels[i] ?? "", centerX - 1, y + h + 4, {
        align: "left",
        angle: -45,
      });
    } else {
      doc.text(labels[i] ?? "", centerX, y + h + 5, { align: "center" });
    }
  });
}
function header(
  doc: jsPDF,
  identity: ReportIdentity,
  title: string,
  generationTime: Date,
  subtitle: string,
) {
  doc.setTextColor(30, 31, 32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  const lines = doc.splitTextToSize(identity.heading, 170);
  doc.text(lines, 105, 18, { align: reportLayoutSpec.headerAlignment });
  const offset = (lines.length - 1) * 6;
  doc.setFontSize(12);
  doc.text(`${title} Report`, 105, 29 + offset, {
    align: reportLayoutSpec.headerAlignment,
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Generated: ${generatedLabel(generationTime)}`, 105, 36 + offset, {
    align: reportLayoutSpec.headerAlignment,
  });
  doc.text(subtitle, 105, 42 + offset, {
    align: reportLayoutSpec.headerAlignment,
  });
  doc.setDrawColor(201, 177, 117);
  doc.line(20, 47 + offset, 190, 47 + offset);
  return 56 + offset;
}
function footers(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(220);
    doc.line(20, 279, 190, 279);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(reportLayoutSpec.footerBrand, 20, 286);
    doc.text(`Page ${page} of ${pages}`, 190, 286, { align: "right" });
  }
}
export function renderReportPdf(
  data: ReportData,
  identity: ReportIdentity,
  generationTime = new Date(),
) {
  const doc = new jsPDF();
  const title =
    data.reportType === "site-activity" ? "Site Activity" : "Visitor Profile";
  let y = header(doc, identity, title, generationTime, data.subtitle);
  const number = (n: number) => n.toLocaleString("en-GB");
  if (data.reportType === "site-activity") {
    const m = data.metrics;
    const tiles: [
      [string, string],
      [string, string],
      [string, string],
      [string, string],
    ] = [
      ["Entrances", number(m.totalEntrances)],
      ["Exits", number(m.totalExits)],
      ["Avg occupancy", number(m.occupancyAvg)],
      ["Avg dwell (min)", number(m.dwellAvg)],
    ];
    tiles.forEach(([label, value], i) => {
      const x = 20 + i * 43;
      doc.setFillColor(247, 246, 241);
      doc.roundedRect(x, y, 40, 20, 2, 2, "F");
      doc.setFontSize(7);
      doc.setTextColor(90);
      doc.text(label.toUpperCase(), x + 20, y + 6, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(value, x + 20, y + 15, { align: "center" });
      doc.setFont("helvetica", "normal");
    });
    y += 29;
    [
      ["Footfall", m.footfallSeries],
      ["Occupancy", m.occupancySeries],
      ["Dwell (minutes)", m.dwellSeries],
    ].forEach(([label, values]) => {
      if (y > 225) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.text(label as string, 105, y, { align: "center" });
      const rotateLabels = chartLabelAngle(data) === 45;
      bars(
        doc,
        data,
        values as number[],
        data.bucketLabels,
        20,
        y + 4,
        170,
        34,
        {
          rotateLabels,
        },
      );
      y += rotateLabels ? 57 : 51;
    });
    const tableHeader = () => {
      doc.setFillColor(239, 238, 233);
      doc.rect(20, y, 170, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      ["Period", "Entrances", "Exits", "Occupancy", "Dwell"].forEach((v, i) =>
        doc.text(v, 23 + i * 34, y + 5),
      );
      doc.setFont("helvetica", "normal");
      y += 9;
    };
    if (y > 245) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Period summary", 105, y, { align: "center" });
    y += 5;
    tableHeader();
    data.bucketLabels.forEach((label, i) => {
      if (y > 273) {
        doc.addPage();
        y = 20;
        tableHeader();
      }
      if (i % 2) {
        doc.setFillColor(249, 249, 247);
        doc.rect(20, y - 1, 170, 7, "F");
      }
      doc.setFontSize(7);
      doc.setTextColor(40);
      [
        label,
        number(m.entrancesSeries[i] ?? 0),
        number(m.exitsSeries[i] ?? 0),
        number(m.occupancySeries[i] ?? 0),
        number(m.dwellSeries[i] ?? 0),
      ].forEach((v, c) => doc.text(String(v), 23 + c * 34, y + 4));
      y += 7;
    });
  } else {
    const m = data.metrics;
    doc.setFontSize(9);
    doc.setTextColor(70);
    doc.text(
      `Based on ${number(m.totalEntrances)} entrances in this period.`,
      105,
      y,
      { align: "center" },
    );
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Age distribution", 72.5, y, { align: "center" });
    bars(doc, data, m.agePct, AGE_BUCKET_LABELS, 20, y + 5, 105, 48, {
      percentage: true,
    });
    doc.text("Sex split", 162.5, y, { align: "center" });
    bars(doc, data, m.sexPct, SEX_BUCKET_LABELS, 135, y + 5, 55, 48, {
      percentage: true,
    });
    y += 67;
    doc.setFillColor(247, 246, 241);
    doc.roundedRect(20, y, 170, 30, 2, 2, "F");
    doc.setFontSize(9);
    doc.text("Visitor profile summary", 105, y + 8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(`Largest age group: ${m.dominantAgeBucket ?? "—"}`, 105, y + 17, {
      align: "center",
    });
    doc.text(
      `Sex split: ${m.sexSplit.Male}% Male / ${m.sexSplit.Female}% Female`,
      105,
      y + 24,
      { align: "center" },
    );
  }
  footers(doc);
  return { doc, filename: reportFilename(identity, title) };
}
