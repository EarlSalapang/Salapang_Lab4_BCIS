import ExcelJS from "exceljs";
import type { Row } from "exceljs";
import pdfMake from "pdfmake";
import helvetica from "pdfmake/standard-fonts/Helvetica.js";

import type { Report, ReportColumn, ReportKpi, ReportRow } from "@bcis/shared";

pdfMake.setFonts(helvetica);
pdfMake.setLocalAccessPolicy(() => true);
pdfMake.setUrlAccessPolicy(() => true);

const MONEY_FORMAT = '"₱"#,##0.00';
const NUMBER_FORMAT = "#,##0";

function sheetName(title: string): string {
  const cleaned = title.replace(/[\\/?*[\]:]/g, " ").trim();
  return cleaned.slice(0, 31) || "Report";
}

function displayMoney(cents: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(cents / 100);
}

function displayNumber(value: number): string {
  return new Intl.NumberFormat("en-PH").format(value);
}

function displayValue(value: string | number | null, format: ReportColumn["format"]): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  switch (format) {
    case "money":
      return displayMoney(value);
    case "percent":
      return `${displayNumber(value)}%`;
    case "number":
      return displayNumber(value);
    default:
      return String(value);
  }
}

function excelValue(value: string | number | null, column: ReportColumn): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && (column.format === "money" || column.format === "number" || column.format === "percent")) {
    return column.format === "money" ? value / 100 : value;
  }
  return value;
}

function numberFormatFor(column: ReportColumn): string | undefined {
  switch (column.format) {
    case "money":
      return MONEY_FORMAT;
    case "number":
      return NUMBER_FORMAT;
    case "percent":
      return '0.0"%"';
    default:
      return undefined;
  }
}

function applyFormats(row: Row, columns: ReportColumn[]): void {
  columns.forEach((column, index) => {
    const format = numberFormatFor(column);
    if (format) row.getCell(index + 1).numFmt = format;
  });
}

function kpiExcelValue(kpi: ReportKpi): string | number {
  if (kpi.format === "money") return kpi.value / 100;
  if (kpi.format === "percent") return kpi.value;
  return kpi.value;
}

export async function buildReportWorkbook(report: Report): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BCIS Billing";
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet(sheetName(report.title));

  const titleRow = sheet.addRow([report.title]);
  titleRow.font = { bold: true, size: 14 };
  if (report.subtitle) sheet.addRow([report.subtitle]);
  sheet.addRow([`Generated ${report.generatedAt}`]);
  if (report.parameters) {
    for (const [key, value] of Object.entries(report.parameters)) {
      sheet.addRow([key, value]);
    }
  }
  sheet.addRow([]);

  if (report.kpis && report.kpis.length > 0) {
    const header = sheet.addRow(["Metric", "Value"]);
    header.font = { bold: true };
    for (const kpi of report.kpis) {
      const row = sheet.addRow([kpi.label, kpiExcelValue(kpi)]);
      if (kpi.format === "money") row.getCell(2).numFmt = MONEY_FORMAT;
      else if (kpi.format === "percent") row.getCell(2).numFmt = '0.0"%"';
    }
    sheet.addRow([]);
  }

  for (const section of report.sections) {
    if (section.title) {
      const heading = sheet.addRow([section.title]);
      heading.font = { bold: true };
    }
    const header = sheet.addRow(section.columns.map((column) => column.label));
    header.font = { bold: true };
    for (const row of section.rows) {
      const added = sheet.addRow(section.columns.map((column) => excelValue(row[column.key] ?? null, column)));
      applyFormats(added, section.columns);
    }
    if (section.totals) {
      const totals = section.totals;
      const added = sheet.addRow(
        section.columns.map((column) =>
          column.key in totals ? excelValue(totals[column.key] ?? null, column) : null,
        ),
      );
      added.font = { bold: true };
      applyFormats(added, section.columns);
    }
    sheet.addRow([]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function alignmentFor(column: ReportColumn): "left" | "right" | "center" {
  return column.align;
}

function pdfValue(value: string | number | null, format: ReportColumn["format"]): string {
  return displayValue(value ?? null, format);
}

export async function buildReportPdf(report: Report): Promise<Buffer> {
  const content: Record<string, unknown>[] = [];
  content.push({ text: report.title, style: "title" });
  if (report.subtitle) content.push({ text: report.subtitle, style: "subtitle" });
  content.push({ text: `Generated ${report.generatedAt}`, style: "meta" });

  if (report.parameters && Object.keys(report.parameters).length > 0) {
    const line = Object.entries(report.parameters)
      .map(([key, value]) => `${key}: ${value}`)
      .join("    ");
    content.push({ text: line, style: "meta" });
  }

  if (report.kpis && report.kpis.length > 0) {
    content.push({
      columns: report.kpis.map((kpi) => ({
        width: "*",
        stack: [
          { text: kpi.label, style: "kpiLabel" },
          { text: displayValue(kpi.value, kpi.format), style: "kpiValue" },
        ],
      })),
      columnGap: 8,
      margin: [0, 10, 0, 10],
    });
  }

  for (const section of report.sections) {
    if (section.title) content.push({ text: section.title, style: "section" });
    const body: Record<string, unknown>[][] = [
      section.columns.map((column) => ({
        text: column.label,
        style: "tableHeader",
        alignment: alignmentFor(column),
      })),
    ];
    for (const row of section.rows) {
      body.push(
        section.columns.map((column) => ({
          text: pdfValue((row as ReportRow)[column.key] ?? null, column.format),
          alignment: alignmentFor(column),
        })),
      );
    }
    if (section.totals) {
      const totals = section.totals;
      body.push(
        section.columns.map((column) => ({
          text: column.key in totals ? pdfValue(totals[column.key] ?? null, column.format) : "",
          alignment: alignmentFor(column),
          bold: true,
        })),
      );
    }
    content.push({
      table: {
        headerRows: 1,
        widths: section.columns.map(() => "*"),
        body,
      },
      layout: "lightHorizontalLines",
      margin: [0, 4, 0, 12],
    });
  }

  const definition: Record<string, unknown> = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 24, 24, 24],
    defaultStyle: { font: "Helvetica", fontSize: 8 },
    styles: {
      title: { fontSize: 15, bold: true },
      subtitle: { fontSize: 10, color: "#475569" },
      meta: { fontSize: 8, color: "#64748b", margin: [0, 2, 0, 0] },
      section: { fontSize: 10, bold: true, margin: [0, 8, 0, 0] },
      kpiLabel: { fontSize: 8, color: "#64748b" },
      kpiValue: { fontSize: 11, bold: true },
      tableHeader: { fontSize: 8, bold: true, fillColor: "#e2e8f0" },
    },
    content,
  };

  return pdfMake.createPdf(definition).getBuffer();
}
