import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { loadMarketplaceInbox } from '../../../../lib/marketplace-chat-inbox';
import { withApi } from '../../../../lib/api-handler';

// Обʼєднаний список чатів з покупцями обох маркетплейсів (живі дані, без
// дзеркала в БД). Логіка — lib/marketplace-chat-inbox, спільна з бейджем.

export type { MarketplaceChatItem } from '../../../../lib/marketplace-chat-inbox';

async function _GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { items, errors } = await loadMarketplaceInbox();
  return NextResponse.json({ items, errors });
}

export const GET = withApi('admin/marketplace-chats', _GET);
