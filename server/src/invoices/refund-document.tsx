import type * as ReactPdf from '@react-pdf/renderer';

// Same deferred-import discipline as invoice-document.tsx — @react-pdf/renderer is
// ESM-only and cannot be require()d on Vercel's runtime, so the loaded module is passed in
// rather than imported here. See invoice-document.tsx's header for the full reasoning.
export function createRefundDocument(reactPdf: typeof ReactPdf) {
  const { Document, Page, Text, View, StyleSheet } = reactPdf;

  const styles = StyleSheet.create({
    page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#16192b' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
    brand: { fontSize: 18, fontWeight: 700, color: '#101c4d' },
    brandSub: { fontSize: 9, color: '#64748b', marginTop: 2 },
    docTitle: { fontSize: 14, fontWeight: 700, textAlign: 'right', color: '#b91c1c' },
    metaLabel: { color: '#94a3b8', fontSize: 8, textAlign: 'right' },
    metaValue: { fontSize: 10, textAlign: 'right', marginBottom: 4 },
    section: { marginBottom: 16 },
    sectionLabel: { fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 },
    table: { borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 6 },
    tableHeaderRow: { flexDirection: 'row', paddingVertical: 6, backgroundColor: '#f1f5f9' },
    colName: { flex: 3 },
    colQty: { flex: 1, textAlign: 'center' },
    colPrice: { flex: 1.2, textAlign: 'right' },
    colTotal: { flex: 1.2, textAlign: 'right' },
    headerCell: { fontSize: 8, textTransform: 'uppercase', color: '#64748b' },
    totalsBox: { marginTop: 12, alignSelf: 'flex-end', width: 220 },
    grandTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: '#b91c1c',
    },
    grandTotalLabel: { fontSize: 11, fontWeight: 700, color: '#b91c1c' },
    grandTotalValue: { fontSize: 11, fontWeight: 700, color: '#b91c1c' },
    reasonBox: { marginTop: 10, padding: 8, backgroundColor: '#f8fafc' },
    footer: { marginTop: 40, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
  });

  function money(piastres: number) {
    return `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  return function RefundDocument({ refund, refundedByName }: RefundDocProps) {
    const originalInvoice = `INV-${refund.invoiceYear}-${String(refund.invoiceNo).padStart(5, '0')}`;

    return (
      <Document>
        <Page size="A5" style={styles.page}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>ELITE BLUE</Text>
              <Text style={styles.brandSub}>Veterinary Center</Text>
            </View>
            <View>
              <Text style={styles.docTitle}>CREDIT NOTE</Text>
              <Text style={styles.metaLabel}>Against invoice</Text>
              <Text style={styles.metaValue}>{originalInvoice}</Text>
              <Text style={styles.metaLabel}>Refunded on</Text>
              <Text style={styles.metaValue}>{new Date(refund.createdAt).toLocaleString('en-GB')}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Refunded to</Text>
            <Text>{refund.customerName}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Processed by</Text>
            <Text>{refundedByName}</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.headerCell, styles.colName]}>Item returned</Text>
              <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
              <Text style={[styles.headerCell, styles.colPrice]}>Unit price</Text>
              <Text style={[styles.headerCell, styles.colTotal]}>Refunded</Text>
            </View>
            {refund.items.map((item, idx) => (
              <View style={styles.tableRow} key={idx}>
                <Text style={styles.colName}>{item.productName}</Text>
                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colPrice}>{money(item.unitPrice)}</Text>
                <Text style={styles.colTotal}>{money(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBox}>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total refunded</Text>
              {/* The stored refund total, not a re-sum of the lines above: when the original
                  sale carried a discount, each line is refunded at its discounted share, so
                  a naive sum of list prices would overstate what was actually returned. */}
              <Text style={styles.grandTotalValue}>{money(refund.total)}</Text>
            </View>
          </View>

          {refund.reason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.sectionLabel}>Reason</Text>
              <Text>{refund.reason}</Text>
            </View>
          ) : null}

          <Text style={styles.footer}>
            This credit note confirms a refund against {originalInvoice}. System-generated by Elite Blue Veterinary Center.
          </Text>
        </Page>
      </Document>
    );
  };
}

export interface RefundDocProps {
  refund: {
    invoiceYear: number;
    invoiceNo: number;
    customerName: string;
    createdAt: Date | string;
    total: number;
    reason?: string | null;
    items: { productName: string; quantity: number; unitPrice: number }[];
  };
  refundedByName: string;
}
