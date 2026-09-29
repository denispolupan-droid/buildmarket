/**
 * Сортування пошти Zoho: створює папки й розкладає накопичене у «Вхідних»
 * за відправником. Постійні правила (фільтри) Zoho API не має — їх заводять
 * в інтерфейсі, цей скрипт лише прибирає бэклог.
 *
 *   npx tsx --env-file=.env.local scripts/zoho-sort-inbox.ts           # dry-run
 *   npx tsx --env-file=.env.local scripts/zoho-sort-inbox.ts --apply
 *
 * Бекап (messageId + звідки) пишеться у scripts/.zoho-sort-backup-<ts>.json.
 */
import { writeFileSync } from 'node:fs';
import { zohoFetch, getAccountId } from '../lib/zoho-mail';

const APPLY = process.argv.includes('--apply');

// Куди що класти. match — по адресі відправника (нижній регістр).
// Порядок важливий: перший збіг перемагає.
type Rule = { folder: string | 'SPAM'; match: (from: string) => boolean };
const dom = (...ds: string[]) => (from: string) => ds.some(d => from === d || from.endsWith('@' + d) || from.endsWith('.' + d));

const RULES: Rule[] = [
  { folder: 'SPAM',                     match: (f) => ['zhangyanchao06@gmail.com'].includes(f) },
  { folder: 'Сайт',                     match: dom('fixline.com.ua') },
  { folder: 'Маркетплейси/Rozetka',     match: dom('rozetka.com.ua', 'rozetka.ua', 'rozetka.delivery') },
  { folder: 'Маркетплейси/Prom',        match: dom('prom.ua') },
  { folder: 'Маркетплейси/Епіцентр',    match: (f) => dom('epicentrk.ua')(f) || f === 'support.marketplace@meest.com' },
  { folder: 'Платежі',                  match: dom('rozetkapay.com', 'novapay.ua') },
  { folder: 'Нова Пошта',               match: dom('novaposhta.ua') },
  // Службове: DMARC-звіти, повідомлення Zoho — у папку «Оповещения» (з 11.09 під /Службове).
  { folder: 'Службове/Оповещения',      match: (f) => f === 'noreply-dmarc-support@google.com' || dom('zohoaccounts.eu', 'zoho.eu', 'zohocorp.com', 'zohostore.eu')(f) },
];

type Folder = { folderId: string; path: string; folderName: string };
type Msg = { messageId: string; fromAddress: string; subject: string; folderId: string };

// Zoho-ідентифікатори — 19-значні long, більші за 2^53: у JSON їх треба
// відправляти сирими числами, а через JSON.stringify(Number) вони зіпсуються.
const rawIds = (ids: string[]) => `[${ids.join(',')}]`;

async function listFolders(accountId: string): Promise<Folder[]> {
  const r = await zohoFetch(`/accounts/${accountId}/folders`);
  return (r.data ?? []).map((f: Folder) => ({ folderId: String(f.folderId), path: f.path, folderName: f.folderName }));
}

async function ensureFolder(accountId: string, folders: Folder[], path: string): Promise<string> {
  const parts = path.split('/');
  let parentId: string | null = null;
  let curPath = '';
  for (const name of parts) {
    curPath += '/' + name;
    let f = folders.find(x => x.path === curPath);
    if (!f) {
      if (!APPLY) {
        console.log(`  [dry] would create folder ${curPath}`);
        f = { folderId: `NEW:${curPath}`, path: curPath, folderName: name };
      } else {
        const body = parentId ? `{"folderName":${JSON.stringify(name)},"parentFolderId":${parentId}}` : `{"folderName":${JSON.stringify(name)}}`;
        const r = await zohoFetch(`/accounts/${accountId}/folders`, { method: 'POST', body });
        const id = String(r?.data?.folderId ?? '');
        if (!id) throw new Error('create folder failed: ' + JSON.stringify(r));
        f = { folderId: id, path: curPath, folderName: name };
        console.log(`  created ${curPath} → ${id}`);
      }
      folders.push(f);
    }
    parentId = f.folderId;
  }
  return parentId!;
}

async function scanInbox(accountId: string, inboxId: string): Promise<Msg[]> {
  const out: Msg[] = [];
  for (let start = 1; start < 20000; start += 200) {
    const r = await zohoFetch(`/accounts/${accountId}/messages/view?folderId=${inboxId}&start=${start}&limit=200`);
    const list: Msg[] = r.data ?? [];
    out.push(...list.map(m => ({ ...m, messageId: String(m.messageId), fromAddress: String(m.fromAddress ?? '').toLowerCase() })));
    if (list.length < 200) break;
  }
  return out;
}

async function main() {
  const accountId = await getAccountId();
  const folders = await listFolders(accountId);
  const inbox = folders.find(f => f.path === '/Inbox');
  if (!inbox) throw new Error('no /Inbox');

  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');

  // 1. Папки
  const targetIds = new Map<string, string>();
  for (const path of [...new Set(RULES.map(r => r.folder).filter(f => f !== 'SPAM'))]) {
    targetIds.set(path, await ensureFolder(accountId, folders, path));
  }

  // 2. Класифікація
  const msgs = await scanInbox(accountId, inbox.folderId);
  const groups = new Map<string, Msg[]>();
  const stay: Msg[] = [];
  for (const m of msgs) {
    const rule = RULES.find(r => r.match(m.fromAddress));
    if (!rule) { stay.push(m); continue; }
    groups.set(rule.folder, [...(groups.get(rule.folder) ?? []), m]);
  }

  console.log(`\nInbox: ${msgs.length} messages`);
  for (const [folder, list] of groups) {
    const by = new Map<string, number>();
    for (const m of list) by.set(m.fromAddress, (by.get(m.fromAddress) ?? 0) + 1);
    console.log(`\n→ ${folder}: ${list.length}`);
    for (const [k, v] of [...by].sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(4)}  ${k}`);
  }
  console.log(`\n= stay in Inbox: ${stay.length}`);
  const byStay = new Map<string, number>();
  for (const m of stay) byStay.set(m.fromAddress, (byStay.get(m.fromAddress) ?? 0) + 1);
  for (const [k, v] of [...byStay].sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(4)}  ${k}`);

  if (!APPLY) return;

  // 3. Бекап
  const backup = [...groups].flatMap(([folder, list]) => list.map(m => ({ messageId: m.messageId, from: m.fromAddress, subject: m.subject, fromFolder: inbox.folderId, to: folder })));
  const file = `scripts/.zoho-sort-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nbackup: ${file}`);

  // 4. Переміщення
  const BATCH = 50;
  for (const [folder, list] of groups) {
    const ids = list.map(m => m.messageId);
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const body = folder === 'SPAM'
        ? `{"mode":"moveToSpam","messageId":${rawIds(chunk)},"isFolderSpecific":false}`
        : `{"mode":"moveMessage","destfolderId":${targetIds.get(folder)},"messageId":${rawIds(chunk)}}`;
      const r = await zohoFetch(`/accounts/${accountId}/updatemessage`, { method: 'PUT', body });
      if (r?.status?.code !== 200) throw new Error(`move failed (${folder}): ${JSON.stringify(r)}`);
      console.log(`  ${folder}: moved ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
    }
  }
  console.log('\ndone');
}

main().catch(e => { console.error(e); process.exit(1); });
