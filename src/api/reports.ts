import { api } from './client';

/**
 * Renders the month's activity report server-side and downloads it. The signed link is
 * issued with a download filename, so following it saves the PDF rather than navigating —
 * an anchor click rather than window.open, because the render can take a few seconds and a
 * popup opened that long after the click is what browsers block.
 */
export async function downloadMonthlyReport(month?: string): Promise<void> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const { url } = await api.get<{ url: string }>(`/reports/monthly${qs}`);
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
