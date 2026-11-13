// Підключення API Meest (договір 10031120). Запускати У СВОЄМУ терміналі, не через
// чат: дані питаються інтерактивно, пароль не відображається, у вивід нічого
// секретного не потрапляє — лише результат перевірки договору.
//   npx tsx --env-file=.env.local scripts/set-meest-credentials.ts
//   npx tsx --env-file=.env.local scripts/set-meest-credentials.ts --clipboard   (токен з буфера)
//
// Кабінет 24.meest.com → Налаштування → API інтеграції → «Створити API-інтеграцію»
// дає або логін і пароль, або готовий токен — скрипт приймає обидва варіанти.
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { createServiceClient } from '../lib/supabase';
import { writeSetting } from '../lib/secrets';
import { meestLogin, meestContractInfo, meestContractId } from '../lib/meest-api';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Замість символів нічого не друкуємо
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

/** Буфер обміну Windows (токен скопійовано кнопкою в кабінеті) — без виводу на екран. */
function clipboard(): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' }).trim();
}

(async () => {
  const db = createServiceClient();
  // --clipboard: без запитань (можна запускати й через «!» у чаті — секрет не друкується)
  // startsWith: при вставці команди з буфера до прапорця «приклеюється» вміст буфера
  const fromClipboard = process.argv.some(a => a.startsWith('--clipboard'));
  const mode = fromClipboard ? '2' : ((await ask('Що дав кабінет Meest? 1 — логін і пароль, 2 — готовий токен [1]: ')) || '1');
  try {
    if (mode === '2') {
      const token = fromClipboard ? clipboard() : await ask('Токен: ', true);
      if (fromClipboard && !/^[A-Za-z0-9._-]{16,}$/.test(token)) throw new Error('у буфері обміну не схоже на токен — натисніть «копіювати» біля «API токен» у кабінеті');
      if (!token) throw new Error('порожній токен');
      await writeSetting(db, 'meest_api_token', token);            // → Vault
    } else {
      const username = await ask('Логін API: ');
      const password = await ask('Пароль API: ', true);
      if (!username || !password) throw new Error('порожній логін або пароль');
      await meestLogin({ username, password });                     // перевірка + токени → Vault
      await writeSetting(db, 'meest_api_username', username);       // → Vault
      await writeSetting(db, 'meest_api_password', password);       // → Vault
    }
    const c = await meestContractInfo();
    console.log(`OK — доступ працює. Договір ${c.number ?? c.contract ?? '?'} (${await meestContractId()}), ${c.clientFullName ?? c.client ?? ''}, ЄДРПОУ/ІПН ${c.edrpou ?? '?'}, наложка ${c.allowedCOD ? 'дозволена' : 'НЕ дозволена'}, діє до ${c.dateTo ?? '?'}`);
  } catch (err) {
    console.log('Не вийшло:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
