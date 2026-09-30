/**
 * Реєстри виплат з пошти (Zoho, папка «Платежі» + «Вхідні») → облік.
 *
 *  · erp-backoffice-mailer@novapay.ua «Реєстр платежів контрагента … № N від …» —
 *    XLSX-вкладення зі складом виплати наложки по ЕН → lib/novapay-register.
 *  · reports@rozetkapay.com «Реєстр платежів ФОП …_YYYY-MM-DD» — у тілі посилання на
 *    XLSX (storage.googleapis.com, підписане, діє 365 днів) → lib/rozetkapay-register-apply.
 *  · reports@rozetkapay.com «Взаєморозрахунки … за період …» — місячний акт, пропускаємо.
 *
 * Кожен лист обробляється рівно раз (mail_register_imports). Якщо виписка ще не
 * підтягнута (документа з таким номером реєстру / переказу немає) — лист лишається
 * зі статусом no-doc і повторюється наступним прогоном.
 */
import * as XLSX from 'xlsx';
import { createServiceClient } from './supabase';
import { zohoFetch, zohoFetchBinary, getAccountId } from './zoho-mail';
import { parseNpRegisterSheet, applyNpRegister, type NpRegisterApplyResult } from './novapay-register';
import { applyRzPayRegisterFile, type RzPayRegisterApplyResult } from './rozetkapay-register-apply';
import { ingestNovapayStatement } from './novapay-ingest';
import { classifyRegisterMail, extractRzPayRegisterLink, type MailKind } from './mail-registers-rules';

export { classifyRegisterMail, extractRzPayRegisterLink } from './mail-registers-rules';
export type { MailKind } from './mail-registers-rules';

type ZohoMsg = { messageId: string; fromAddress: string; subject: string; receivedTime: string; hasAttachment?: string | boolean };

export type MailRegistersResult = {
  scanned: number;
  processed: { messageId: string; kind: MailKind; registerNo: string | null; status: string; summary: string }[];
  skipped: number;
  errors: string[];
};

function summarizeNp(r: NpRegisterApplyResult): string {
  if (r.status === 'no-doc') return `виписки з реєстром № ${r.registerNo} ще немає`;
  return `№ ${r.registerNo}: проведено ${r.posted.length} (${r.posted.map(p => '#' + p.orderNumber).join(' ')}), сторно ${r.undone.length}, без змін ${r.keep}` + (r.unknown.length ? `, без замовлення ${r.unknown.length} (${r.unknown.map(u => u.ttn).join(', ')})` : '');
}
function summarizeRz(r: RzPayRegisterApplyResult): string {
  const found = r.payouts.filter(p => p.monoTxnId).length;
  return `переказів ${found}/${r.payouts.length}, проведено ${r.posted.length}, сторно ${r.undone.length}, повернень ${r.refunded.length}, без змін ${r.kept}` + (r.unknown.length ? `, без замовлення ${r.unknown.length}` : '') + (r.warnings.length ? `; ${r.warnings.join(' | ')}` : '');
}

export async function importMailRegisters(opts: { days?: number; createdBy: string; dryRun?: boolean }): Promise<MailRegistersResult> {
  const db = createServiceClient();
  const days = opts.days ?? 3;
  const since = Date.now() - days * 86400000;
  const res: MailRegistersResult = { scanned: 0, processed: [], skipped: 0, errors: [] };

  const accountId = await getAccountId();
  const folders = ((await zohoFetch(`/accounts/${accountId}/folders`)).data ?? []) as { folderId: string; path: string }[];
  const targets = folders.filter(f => f.path === '/Платежі' || f.path === '/Inbox');
  const msgs: (ZohoMsg & { folderId: string })[] = [];
  for (const f of targets) {
    for (let start = 1; start < 1000; start += 100) {
      const r = await zohoFetch(`/accounts/${accountId}/messages/view?folderId=${f.folderId}&start=${start}&limit=100`);
      const list = (r.data ?? []) as ZohoMsg[];
      const fresh = list.filter(m => Number(m.receivedTime) >= since);
      msgs.push(...fresh.map(m => ({ ...m, messageId: String(m.messageId), folderId: f.folderId })));
      if (list.length < 100 || fresh.length < list.length) break;
    }
  }
  res.scanned = msgs.length;
  const ids = msgs.map(m => m.messageId);
  const { data: doneRows } = ids.length ? await db.from('mail_register_imports').select('message_id, status').in('message_id', ids).limit(ids.length) : { data: [] };
  const done = new Map((doneRows ?? []).map(r => [String(r.message_id), r.status as string]));

  // Виписка NovaPay могла ще не підтягнутись за сьогодні — освіжаємо один раз до обробки
  let ingested = false;

  for (const m of msgs.sort((a, b) => Number(a.receivedTime) - Number(b.receivedTime))) {
    const cls = classifyRegisterMail(String(m.fromAddress ?? ''), String(m.subject ?? ''));
    if (!cls.source || cls.kind === 'other') continue;
    const prev = done.get(m.messageId);
    if (prev && prev !== 'no-doc' && prev !== 'error') { res.skipped++; continue; }
    const receivedAt = new Date(Number(m.receivedTime)).toISOString();
    const save = async (status: 'done' | 'skipped' | 'no-doc' | 'error', result: unknown, error?: string) => {
      if (opts.dryRun) return;
      await db.from('mail_register_imports').upsert({ message_id: m.messageId, source: cls.source, kind: cls.kind, register_no: cls.registerNo, subject: String(m.subject ?? '').slice(0, 200), received_at: receivedAt, status, result: result ?? null, error: error ?? null, processed_at: new Date().toISOString() });
    };
    try {
      if (cls.kind === 'rzpay-act') { await save('skipped', { reason: 'місячний акт' }); res.skipped++; continue; }
      if (cls.kind === 'np-register') {
        const info = await zohoFetch(`/accounts/${accountId}/folders/${m.folderId}/messages/${m.messageId}/attachmentinfo`);
        const att = ((info?.data?.attachments ?? []) as { attachmentId: string; attachmentName: string }[]).find(a => /xlsx?$/i.test(a.attachmentName));
        if (!att) { await save('error', null, 'немає XLSX-вкладення'); res.errors.push(`${m.subject}: немає XLSX`); continue; }
        const buf = await zohoFetchBinary(`/accounts/${accountId}/folders/${m.folderId}/messages/${m.messageId}/attachments/${att.attachmentId}`);
        const wb = XLSX.read(buf, { type: 'buffer' });
        const reg = parseNpRegisterSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }));
        let r = await applyNpRegister(reg, opts.createdBy, { dryRun: opts.dryRun });
        if (r.status === 'no-doc' && !ingested && !opts.dryRun) {
          ingested = true;
          await ingestNovapayStatement(4).catch(() => null);
          r = await applyNpRegister(reg, opts.createdBy, { dryRun: opts.dryRun });
        }
        await save(r.status === 'no-doc' ? 'no-doc' : 'done', r);
        res.processed.push({ messageId: m.messageId, kind: cls.kind, registerNo: reg.registerNo, status: r.status, summary: summarizeNp(r) });
        continue;
      }
      if (cls.kind === 'rzpay-register') {
        const content = await zohoFetch(`/accounts/${accountId}/folders/${m.folderId}/messages/${m.messageId}/content`);
        const link = extractRzPayRegisterLink(String(content?.data?.content ?? ''));
        if (!link) { await save('error', null, 'у листі немає посилання на XLSX'); res.errors.push(`${m.subject}: немає посилання`); continue; }
        const dl = await fetch(link);
        if (!dl.ok) { await save('error', null, `завантаження ${dl.status}`); res.errors.push(`${m.subject}: HTTP ${dl.status}`); continue; }
        const buf = Buffer.from(await dl.arrayBuffer());
        const r = await applyRzPayRegisterFile(buf, `rzpay-${cls.registerNo ?? m.messageId}.xlsx`, opts.createdBy, { dryRun: opts.dryRun });
        const missing = r.payouts.some(p => !p.monoTxnId);
        await save(missing ? 'no-doc' : 'done', { register: r.register, payouts: r.payouts.length, posted: r.posted.length, undone: r.undone.length, refunded: r.refunded.length, kept: r.kept, unknown: r.unknown, warnings: r.warnings });
        res.processed.push({ messageId: m.messageId, kind: cls.kind, registerNo: cls.registerNo, status: missing ? 'no-doc' : 'done', summary: summarizeRz(r) });
        continue;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await save('error', null, msg.slice(0, 500));
      res.errors.push(`${m.subject}: ${msg.slice(0, 200)}`);
    }
  }
  return res;
}
