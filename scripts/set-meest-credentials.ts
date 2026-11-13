// Підключення API Meest (договір 10031120). Запускати У СВОЄМУ терміналі, не через
// чат: дані питаються інтерактивно, пароль не відображається, у вивід нічого
// секретного не потрапляє — лише результат перевірки договору.
//   npx tsx --env-file=.env.local scripts/set-meest-credentials.ts
//
// Кабінет 24.meest.com → Налаштування → API інтеграції → «Створити API-інтеграцію»
// дає або логін і пароль, або готовий токен — скрипт приймає обидва варіанти.
import { createInterface } from 'node:readline';
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

(async () => {
  const db = createServiceClient();
  const mode = (await ask('Що дав кабінет Meest? 1 — логін і пароль, 2 — готовий токен [1]: ')) || '1';
  try {
    if (mode === '2') {
      const token = await ask('Токен: ', true);
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
