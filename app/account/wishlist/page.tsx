import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
import { getRole } from '../../../lib/user-role';
import Footer from '../../components/Footer';
import WishlistList from './WishlistList';
import GuestWishlistPage from './GuestWishlistPage';
import { Heart } from 'lucide-react';

export default async function WishlistPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <GuestWishlistPage />;

  const { data: rows } = await supabase
    .from('wishlists')
    .select('product_sku, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const skus = (rows ?? []).map(r => r.product_sku);
  const { data: fetched } = skus.length > 0
    ? await serviceClient
        .from('products')
        .select('*, stock:product_stock(*), characteristics:product_characteristics(*)')
        .in('sku', skus)
        .eq('is_active', true)
    : { data: [] };
  const products = fetched ?? [];

  // Remove orphaned wishlist rows (product was deleted from catalog)
  const validSkus = new Set(products.map(p => p!.sku));
  const orphans = skus.filter(s => !validSkus.has(s));
  if (orphans.length > 0) {
    await supabase.from('wishlists').delete()
      .eq('user_id', user.id)
      .in('product_sku', orphans);
  }

  const role = getRole(user);

  return (
    <>
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div className="mobile-pad" style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 32px 64px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Heart size={20} color="#EF4444" fill="#EF4444" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Обране</h1>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>{products.length} товарів</p>
            </div>
          </div>

          <WishlistList products={products.filter(Boolean) as NonNullable<typeof products[0]>[]} role={role} />
        </div>
      </div>
      <Footer />
    </>
  );
}
