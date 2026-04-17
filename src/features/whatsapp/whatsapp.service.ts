type AdvanceNoticePayload = {
  entity?: string;
  duedate?: string;
  lines?: unknown[];
};

type AdvanceNoticeReferenceData = {
  tranid?: string;
  receivedAt?: Date | string;
  payload?: AdvanceNoticePayload;
};

function formatDate(value: Date | string | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
}

export function formatWhatsAppMessage(
  triggerType: string,
  data: Record<string, unknown>,
): string {
  if (triggerType === 'ADVANCE_NOTICE_RECEIVED') {
    const notice = data as AdvanceNoticeReferenceData;
    const payload = notice.payload ?? {};
    const lineCount = Array.isArray(payload.lines) ? payload.lines.length : 0;

    return [
      '*New Advance Notice Received*',
      `PO Number: ${notice.tranid ?? '-'}`,
      `Supplier: ${payload.entity ?? '-'}`,
      `Expected Date: ${payload.duedate ?? '-'}`,
      `Line Items: ${lineCount}`,
      `Received: ${formatDate(notice.receivedAt)}`,
    ].join('\n');
  }

  return `*External API Event*\nType: ${triggerType}\nReference received in SME Edaran WMS.`;
}

