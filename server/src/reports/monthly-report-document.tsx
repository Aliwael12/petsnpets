import type * as ReactPdf from '@react-pdf/renderer';
import { CLINIC_LOGO_DATA_URI } from '../invoices/clinic-logo';

export interface ReportColumn {
  label: string;
  flex: number;
  align?: 'left' | 'right' | 'center';
}

export interface ReportTable {
  title: string;
  /** One line under the title — e.g. what the totals do and don't include. */
  note?: string;
  columns: ReportColumn[];
  /** Cells are pre-formatted strings, one per column. `muted` greys a row out (voided). */
  rows: { cells: string[]; muted?: boolean }[];
  totals?: string[];
  empty: string;
  /** Leave the "(n)" off the title — for tables whose rows aren't events, like a breakdown. */
  hideCount?: boolean;
}

export interface ReportFigure {
  label: string;
  value: string;
  hint?: string;
}

export interface MonthlyReportData {
  periodLabel: string;
  rangeLabel: string;
  generatedAt: string;
  generatedBy: string;
  figures: ReportFigure[];
  breakdown: ReportTable;
  sections: ReportTable[];
}

// Same reason as invoice-document.tsx: @react-pdf/renderer is ESM-only, so it's handed in
// already loaded (via a dynamic import in the service) instead of being imported here.
export function createMonthlyReportDocument(reactPdf: typeof ReactPdf) {
  const { Document, Page, Text, View, Image, StyleSheet } = reactPdf;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 44,
      paddingBottom: 36,
      paddingHorizontal: 28,
      fontSize: 8,
      fontFamily: 'Helvetica',
      color: '#16192b',
    },
    runningHeader: {
      position: 'absolute',
      top: 16,
      left: 28,
      right: 28,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: '#94a3b8',
    },
    cover: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 14,
    },
    logo: { width: 90, height: 63 },
    title: {
      fontSize: 16,
      fontWeight: 700,
      color: '#101c4d',
      textAlign: 'right',
    },
    period: { fontSize: 11, textAlign: 'right', marginTop: 2 },
    meta: { fontSize: 8, color: '#64748b', textAlign: 'right', marginTop: 2 },
    figures: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 12,
      marginHorizontal: -3,
    },
    figure: {
      width: '25%',
      paddingHorizontal: 3,
      marginBottom: 6,
    },
    figureBox: {
      borderWidth: 1,
      borderColor: '#e2e8f0',
      borderRadius: 4,
      padding: 7,
      minHeight: 48,
    },
    figureLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase' },
    figureValue: {
      fontSize: 12,
      fontWeight: 700,
      color: '#101c4d',
      marginTop: 3,
    },
    figureHint: { fontSize: 7, color: '#94a3b8', marginTop: 2 },
    section: { marginBottom: 14 },
    sectionTitle: {
      fontSize: 10,
      fontWeight: 700,
      color: '#101c4d',
      marginBottom: 2,
    },
    sectionNote: { fontSize: 7, color: '#94a3b8', marginBottom: 4 },
    empty: { fontSize: 8, color: '#94a3b8', paddingVertical: 4 },
    table: { borderTopWidth: 1, borderTopColor: '#cbd5e1' },
    headerRow: {
      flexDirection: 'row',
      backgroundColor: '#f1f5f9',
      paddingVertical: 4,
    },
    headerCell: {
      fontSize: 7,
      fontWeight: 700,
      color: '#475569',
      textTransform: 'uppercase',
      paddingHorizontal: 3,
    },
    row: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#eef2f6',
      paddingVertical: 3,
    },
    rowAlt: { backgroundColor: '#fafbfc' },
    rowMuted: { color: '#94a3b8' },
    cell: { paddingHorizontal: 3 },
    totalsRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: '#101c4d',
      paddingVertical: 4,
    },
    totalsCell: { paddingHorizontal: 3, fontWeight: 700, color: '#101c4d' },
  });

  function Table({ table }: { table: ReportTable }) {
    const cellStyle = (i: number) => ({
      flex: table.columns[i].flex,
      textAlign: table.columns[i].align ?? 'left',
    });
    const renderRow = (row: ReportTable['rows'][number], r: number) => (
      <View
        key={r}
        wrap={false}
        style={[
          styles.row,
          ...(r % 2 === 1 ? [styles.rowAlt] : []),
          ...(row.muted ? [styles.rowMuted] : []),
        ]}
      >
        {row.cells.map((cell, i) => (
          <Text key={i} style={[styles.cell, cellStyle(i)]}>
            {cell}
          </Text>
        ))}
      </View>
    );
    const header = (
      <View style={styles.headerRow}>
        {table.columns.map((c, i) => (
          <Text key={c.label} style={[styles.headerCell, cellStyle(i)]}>
            {c.label}
          </Text>
        ))}
      </View>
    );
    const totals = table.totals && (
      <View style={styles.totalsRow}>
        {table.totals.map((cell, i) => (
          <Text key={i} style={[styles.totalsCell, cellStyle(i)]}>
            {cell}
          </Text>
        ))}
      </View>
    );
    const heading = (
      <>
        <Text style={styles.sectionTitle}>
          {table.hideCount
            ? table.title
            : `${table.title} (${table.rows.length})`}
        </Text>
        {table.note && <Text style={styles.sectionNote}>{table.note}</Text>}
      </>
    );
    const { rows } = table;
    // Page breaks may only fall between body rows: the title and column header travel with
    // the first row, and the totals with the last, so none of them is ever left alone at the
    // edge of a page. A one-row (or empty) table is a single unbreakable block.
    return (
      <View style={styles.section}>
        {rows.length === 0 ? (
          <View wrap={false}>
            {heading}
            <Text style={styles.empty}>{table.empty}</Text>
          </View>
        ) : rows.length === 1 ? (
          <View wrap={false}>
            {heading}
            <View style={styles.table}>
              {header}
              {renderRow(rows[0], 0)}
              {totals}
            </View>
          </View>
        ) : (
          <>
            <View wrap={false}>
              {heading}
              <View style={styles.table}>
                {header}
                {renderRow(rows[0], 0)}
              </View>
            </View>
            {rows.slice(1, -1).map((row, r) => renderRow(row, r + 1))}
            <View wrap={false}>
              {renderRow(rows[rows.length - 1], rows.length - 1)}
              {totals}
            </View>
          </>
        )}
      </View>
    );
  }

  return function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
    return (
      <Document title={`Monthly report — ${data.periodLabel}`}>
        <Page size="A4" orientation="landscape" style={styles.page}>
          <View style={styles.runningHeader} fixed>
            <Text>
              Elite Blue Veterinary Center · Monthly report · {data.periodLabel}
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>

          <View style={styles.cover}>
            <Image style={styles.logo} src={CLINIC_LOGO_DATA_URI} />
            <View>
              <Text style={styles.title}>Monthly activity report</Text>
              <Text style={styles.period}>{data.rangeLabel}</Text>
              <Text style={styles.meta}>
                Generated {data.generatedAt} by {data.generatedBy}
              </Text>
            </View>
          </View>

          <View style={styles.figures}>
            {data.figures.map((f) => (
              <View key={f.label} style={styles.figure}>
                <View style={styles.figureBox}>
                  <Text style={styles.figureLabel}>{f.label}</Text>
                  <Text style={styles.figureValue}>{f.value}</Text>
                  {f.hint && <Text style={styles.figureHint}>{f.hint}</Text>}
                </View>
              </View>
            ))}
          </View>

          <Table table={data.breakdown} />
          {data.sections.map((s) => (
            <Table key={s.title} table={s} />
          ))}
        </Page>
      </Document>
    );
  };
}
