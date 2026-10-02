import type * as ReactPdf from '@react-pdf/renderer';
import { CLINIC_LOGO_DATA_URI } from './clinic-logo';

// Deliberately no top-level `import { Document, ... } from '@react-pdf/renderer'`: that
// package is ESM-only (no CJS entry point at all — see its package.json), and CommonJS
// `require()` of a real ES Module only works where the Node runtime has require(esm)
// support enabled. That's true on newer local Node versions but not, as of writing, on
// Vercel's actual Lambda-based nodejs runtime, where it fails outright. Receiving the
// already-loaded module as a parameter (see invoices.service.tsx, which gets it via a
// dynamic `await import(...)` — always supported, regardless of require(esm)) means this
// file itself never statically requires the ESM-only package at all.
export function createInvoiceDocument(reactPdf: typeof ReactPdf) {
  const { Document, Page, Text, View, Image, StyleSheet } = reactPdf;

  const styles = StyleSheet.create({
    page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#16192b' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    logo: { width: 110, height: 77 },
    invoiceTitle: { fontSize: 14, fontWeight: 700, textAlign: 'right' },
    metaLabel: { color: '#94a3b8', fontSize: 8, textAlign: 'right' },
    metaValue: { fontSize: 10, textAlign: 'right', marginBottom: 4 },
    detailsRow: { flexDirection: 'row', marginBottom: 16 },
    stayBox: { marginBottom: 14, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, fontSize: 9 },
    stayGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    stayRow: { width: '47%', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    stayLabel: { color: '#64748b' },
    detailsCol: { flex: 1 },
    section: { marginBottom: 16 },
    sectionLabel: { fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 },
    subLine: { fontSize: 9, color: '#64748b', marginTop: 2 },
    table: { borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 6 },
    tableHeaderRow: { flexDirection: 'row', paddingVertical: 6, backgroundColor: '#f1f5f9' },
    colName: { flex: 3 },
    colQty: { flex: 1, textAlign: 'center' },
    colPrice: { flex: 1.2, textAlign: 'right' },
    colTotal: { flex: 1.2, textAlign: 'right' },
    headerCell: { fontSize: 8, textTransform: 'uppercase', color: '#64748b' },
    totalsBox: { marginTop: 12, alignSelf: 'flex-end', width: 200 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    grandTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: '#101c4d',
    },
    grandTotalLabel: { fontSize: 11, fontWeight: 700, color: '#101c4d' },
    grandTotalValue: { fontSize: 11, fontWeight: 700, color: '#101c4d' },
    footer: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
    footerThanks: { fontSize: 8, color: '#94a3b8', textAlign: 'center', marginBottom: 3 },
    footerContact: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
    footerContactItem: { fontSize: 8, fontWeight: 700, color: '#101c4d' },
  });

  // Amounts arrive in piastres (integer, matching the DB); this is the one place they're
  // divided by 100 for display.
  function money(piastres: number) {
    return `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  function discountLabel(discount: InvoiceDocProps['transaction']['discount']) {
    if (!discount) return 'Discount';
    return discount.kind === 'percent' ? `Discount (${discount.value}%)` : 'Discount';
  }

  return function InvoiceDocument({ transaction, soldByName, timeZone, stay }: InvoiceDocProps) {
    const invoiceNo = `INV-${transaction.invoiceYear}-${String(transaction.invoiceNo).padStart(5, '0')}`;
    const client = transaction.client;
    const pets = client?.pets ?? [];

    return (
      <Document>
        <Page size="A5" style={styles.page}>
          <View style={styles.header}>
            <Image style={styles.logo} src={CLINIC_LOGO_DATA_URI} />
            <View>
              <Text style={styles.invoiceTitle}>INVOICE</Text>
              <Text style={styles.metaLabel}>Invoice No.</Text>
              <Text style={styles.metaValue}>{invoiceNo}</Text>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatWhen(transaction.createdAt, timeZone)}</Text>
            </View>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailsCol}>
              <Text style={styles.sectionLabel}>Billed to</Text>
              <Text>{transaction.customerName}</Text>
              {client?.legacyId != null && <Text style={styles.subLine}>Client #{client.legacyId}</Text>}
              {client?.phone && <Text style={styles.subLine}>{client.phone}</Text>}
            </View>
            <View style={styles.detailsCol}>
              <Text style={styles.sectionLabel}>Pet(s)</Text>
              <Text>{pets.length > 0 ? pets.join(', ') : '—'}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Served by</Text>
            <Text>{soldByName}</Text>
          </View>

          {stay && (
            <View style={styles.stayBox}>
              <Text style={styles.sectionLabel}>{stay.kind === 'hospitalization' ? 'Hospitalization' : 'Boarding'} details</Text>
              {(() => {
                const days = stayDays(stay.startDate, stay.endDate);
                const rows: [string, string][] = [
                  ['Type', stay.kind === 'hospitalization' ? 'Hospitalization' : 'Boarding'],
                  ['Pet', stay.petName ?? '—'],
                  ['From', formatDay(stay.startDate)],
                  ['To', formatDay(stay.endDate)],
                  ['Days', String(days)],
                  ['Cost per day', money(Math.round(stay.totalAmount / days))],
                  ['Total for the stay', money(stay.totalAmount)],
                  ['Paid so far', money(stay.paidAmount)],
                  ['Left to pay', money(Math.max(0, stay.totalAmount - stay.paidAmount))],
                ];
                return (
                  <View style={styles.stayGrid}>
                    {rows.map(([label, value]) => (
                      <View style={styles.stayRow} key={label}>
                        <Text style={styles.stayLabel}>{label}</Text>
                        <Text>{value}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
              {stay.note ? (
                <View style={{ marginTop: 4 }}>
                  <Text style={styles.stayLabel}>Comments</Text>
                  <Text>{stay.note}</Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.headerCell, styles.colName]}>Item</Text>
              <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
              <Text style={[styles.headerCell, styles.colPrice]}>Unit price</Text>
              <Text style={[styles.headerCell, styles.colTotal]}>Total</Text>
            </View>
            {transaction.items.map((item, idx) => (
              <View style={styles.tableRow} key={idx}>
                <Text style={styles.colName}>{item.productName}</Text>
                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colPrice}>{money(item.unitPrice)}</Text>
                <Text style={styles.colTotal}>{money(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBox}>
            {transaction.discountAmount ? (
              <>
                <View style={styles.totalsRow}>
                  <Text>Subtotal</Text>
                  <Text>{money(transaction.subtotal)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text>{discountLabel(transaction.discount)}</Text>
                  <Text>-{money(transaction.discountAmount)}</Text>
                </View>
                {transaction.discount?.note ? <Text style={styles.subLine}>{transaction.discount.note}</Text> : null}
              </>
            ) : null}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{money(transaction.total)}</Text>
            </View>
            {transaction.payments.length === 1 ? (
              <View style={styles.totalsRow}>
                <Text>Paid with</Text>
                <Text>{PAYMENT_LABELS[transaction.payments[0].method]}</Text>
              </View>
            ) : (
              transaction.payments.map((p) => (
                <View key={p.method} style={styles.totalsRow}>
                  <Text>Paid by {PAYMENT_LABELS[p.method]}</Text>
                  <Text>{money(p.amount)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerThanks}>Thank you for visiting Elite Blue Veterinary Center. This is a system-generated invoice.</Text>
            <View style={styles.footerContact}>
              <Text style={styles.footerContactItem}>{CLINIC_PHONE}</Text>
              <Text style={styles.footerContactItem}>•</Text>
              <Text style={styles.footerContactItem}>{CLINIC_FACEBOOK_HANDLE}</Text>
              <Text style={styles.footerContactItem}>•</Text>
              <Text style={styles.footerContactItem}>{CLINIC_WEBSITE_LABEL}</Text>
            </View>
          </View>
        </Page>
      </Document>
    );
  };
}

/** Public contact details printed on every invoice footer — deliberately plain constants
 * rather than config: they're marketing copy for a printed document, not deployment
 * settings, so a change here is a one-line edit rather than an env var round trip. */
const CLINIC_PHONE = 'Call: +20 109 411 8811';
const CLINIC_FACEBOOK_HANDLE = 'fb.com/elitebluevet';
const CLINIC_WEBSITE_LABEL = 'eliteblueclinic.vercel.app';

/** The owner's own vocabulary — the stored value is 'card' because the same terminal takes
 * Mastercard and Meeza, but a customer reads "Visa / Card" on their receipt. */
const PAYMENT_LABELS: Record<'cash' | 'instapay' | 'card' | 'vodafone_cash', string> = {
  cash: 'Cash',
  instapay: 'InstaPay',
  card: 'Visa / Card',
  vodafone_cash: 'Vodafone Cash',
};

export interface InvoiceDocProps {
  transaction: {
    invoiceYear: number;
    invoiceNo: number;
    customerName: string;
    createdAt: Date | string;
    subtotal: number;
    discountAmount?: number | null;
    discount?: { kind: 'percent' | 'fixed'; value: number; note?: string | null } | null;
    total: number;
    /** One line per method when the bill was split. Empty on sales recorded without a
     * method — the invoice then simply omits the line rather than printing a guess. */
    payments: { method: 'cash' | 'instapay' | 'card' | 'vodafone_cash'; amount: number }[];
    items: { productName: string; quantity: number; unitPrice: number }[];
    /** Absent for sales predating client tracking, or where the client was since deleted. */
    client?: {
      legacyId: number | null;
      phone?: string | null;
      pets: string[];
    } | null;
  };
  soldByName: string;
  /** Present on a sale rung up for a boarding / hospitalization payment. */
  stay?: {
    kind: 'boarding' | 'hospitalization';
    petName: string | null;
    startDate: string;
    endDate: string;
    totalAmount: number;
    paidAmount: number;
    note?: string | null;
  } | null;
  /** The clinic's IANA timezone (the TIMEZONE setting), for the printed date and time. */
  timeZone: string;
}

/** "30 Sept 2026, 2:05 pm" in the clinic's timezone — never the server's (UTC on Vercel). */
function formatWhen(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}


/** Days in a stay, counted like the Boarding page: start to end, a same-day stay is one day. */
function stayDays(start: string, end: string): number {
  return Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000));
}

/** "02 Oct 2026" for a plain YYYY-MM-DD day. */
function formatDay(dayKey: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${dayKey}T12:00:00Z`),
  );
}
