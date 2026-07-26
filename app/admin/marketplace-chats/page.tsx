import { redirect } from 'next/navigation';

// Розділ обʼєднано з чатом сайту: /admin/chat, вкладка «Маркетплейси».
export default function MarketplaceChatsPage() {
  redirect('/admin/chat?tab=mp');
}
