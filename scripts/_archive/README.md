# Архів: старі генератори контенту (12.11.2026)

Ці скрипти кликали модель напряму, повз агентів і `lib/content-rules`, і писали
описи / характеристики / keywords за правилами квітня–липня 2026 — до стандарту
контенту (27.08) і запуску Епіцентру (11.09). Запуск зараз перезаписав би картки
текстом зі старими помилками (короткий опис 150–220 замість ≤160, «якісний»,
«купити … Київ», абзаци про доставку у фідах, характеристики повз словник
`normalizeChars`). Тому вони тут, а не в `scripts/`.

Чим користуватись замість:

| Було | Тепер |
|---|---|
| fill-new-product-content, generate-*-descriptions, mass-enrich-seo, translate-enriched-ru, enrich-descriptions-ru, import-faq | AI-філер у картці товару / розділ SEO (`lib/product-ai-filler`, `lib/product-content-gen`) |
| fill-*-chars, enforce-standards | `normalizeChars` + стандарт категорії (агент заведення товару, AI-філер) |
| generate-keywords | `lib/product-content-gen` (keywords) і `scripts/run-keywords-ru.ts` |

Правила для агентів — лише в `lib/content-rules` (тест `tests/agent-prompts.test.ts`).
Якщо скрипт звідси знадобиться — спершу переведіть його на ці модулі.
