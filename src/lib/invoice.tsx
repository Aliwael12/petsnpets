import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { Product, Transaction } from '../types';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#16192b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  brand: { fontSize: 18, fontWeight: 700, color: '#101c4d' },
  brandSub: { fontSize: 9, color: '#64748b', marginTop: 2 },
  invoiceTitle: { fontSize: 14, fontWeight: 700, textAlign: 'right' },
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
  totalsBox: { marginTop: 12, alignSelf: 'flex-end', width: 200 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#101c4d' },
  grandTotalLabel: { fontSize: 11, fontWeight: 700, color: '#101c4d' },
  grandTotalValue: { fontSize: 11, fontWeight: 700, color: '#101c4d' },
  footer: { marginTop: 40, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
});

function money(v: number) {
  return `EGP ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

interface InvoiceDocProps {
  transaction: Transaction;
  products: Product[];
  soldByName: string;
}

export function InvoiceDocument({ transaction, products, soldByName }: InvoiceDocProps) {
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>PETS &amp; PETS</Text>
            <Text style={styles.brandSub}>Cats Hotel and Clinic</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.metaLabel}>Invoice No.</Text>
            <Text style={styles.metaValue}>{transaction.id.toUpperCase()}</Text>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{new Date(transaction.createdAt).toLocaleString('en-GB')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Billed to</Text>
          <Text>{transaction.customerName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Served by</Text>
          <Text>{soldByName}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, styles.colName]}>Item</Text>
            <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.headerCell, styles.colPrice]}>Unit price</Text>
            <Text style={[styles.headerCell, styles.colTotal]}>Total</Text>
          </View>
          {transaction.items.map((item, idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={styles.colName}>{productName(item.productId)}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{money(item.unitPrice)}</Text>
              <Text style={styles.colTotal}>{money(item.unitPrice * item.quantity)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{money(transaction.total)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Thank you for shopping with Pets &amp; Pets. This is a system-generated invoice.</Text>
      </Page>
    </Document>
  );
}

export async function downloadInvoice(transaction: Transaction, products: Product[], soldByName: string) {
  const blob = await pdf(<InvoiceDocument transaction={transaction} products={products} soldByName={soldByName} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${transaction.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
