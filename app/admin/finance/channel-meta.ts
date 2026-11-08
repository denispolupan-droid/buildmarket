// Канали — з єдиного довідника lib/channels (підписи й кольори одні на журнал,
// «Огляд», «Аналітику», «Звіти»). Файл лишився, щоб не чіпати імпорти каруселі
// «Динаміка» (клієнт) і панелі «Підсумок» (сервер).
import { CHANNELS } from '../../../lib/channels';

export const SOURCE_META: Record<string, { label: string; color: string }> =
  Object.fromEntries(CHANNELS.map(c => [c.code, { label: c.label, color: c.color }]));
