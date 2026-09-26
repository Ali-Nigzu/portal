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
export function reportDocumentText(
  data: ReportData,
  identity: ReportIdentity,
  generationTime: Date,
) {
  const title =
    data.reportType === "site-activity" ? "Site Activity" : "Visitor Profile";
  return [
    identity.heading,
    `${title} Report`,
    `Generated: ${generatedLabel(generationTime)}`,
    data.subtitle,
    "Camos Reports",
  ];
}
function bars(
  doc: jsPDF,
  values: number[],
  labels: string[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const peak = Math.max(...values, 1),
    cell = w / Math.max(values.length, 1);
  doc.setDrawColor(210, 210, 210);
  doc.line(x, y + h, x + w, y + h);
  values.forEach((value, i) => {
    const bh = (value / peak) * (h - 8);
    doc.setFillColor(174, 132, 37);
    doc.roundedRect(
      x + i * cell + 2,
      y + h - bh,
      Math.max(cell - 4, 2),
      bh,
      1,
      1,
      "F",
    );
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(labels[i] ?? "", x + i * cell + cell / 2, y + h + 5, {
      align: "center",
    });
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
  doc.text(lines, 20, 18);
  const offset = (lines.length - 1) * 6;
  doc.setFontSize(12);
  doc.text(`${title} Report`, 20, 29 + offset);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Generated: ${generatedLabel(generationTime)}`, 20, 36 + offset);
  doc.text(subtitle, 20, 42 + offset);
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
    doc.text("Camos Reports", 20, 286);
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
      doc.text(label.toUpperCase(), x + 3, y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(value, x + 3, y + 15);
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
      doc.text(label as string, 20, y);
      bars(doc, values as number[], data.bucketLabels, 20, y + 4, 170, 34);
      y += 51;
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
    doc.text("Period summary", 20, y);
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
      20,
      y,
    );
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Age distribution", 20, y);
    bars(doc, m.agePct, AGE_BUCKET_LABELS, 20, y + 5, 105, 48);
    doc.text("Sex split", 135, y);
    bars(doc, m.sexPct, SEX_BUCKET_LABELS, 135, y + 5, 55, 48);
    y += 67;
    doc.setFillColor(247, 246, 241);
    doc.roundedRect(20, y, 170, 30, 2, 2, "F");
    doc.setFontSize(9);
    doc.text("Visitor profile summary", 25, y + 8);
    doc.setFont("helvetica", "normal");
    doc.text(`Largest age group: ${m.dominantAgeBucket}`, 25, y + 17);
    doc.text(
      `Sex split: ${m.sexSplit.Male}% Male / ${m.sexSplit.Female}% Female`,
      25,
      y + 24,
    );
  }
  footers(doc);
  return { doc, filename: reportFilename(identity, title) };
}
