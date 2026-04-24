import { createSupabaseServer } from '../../../lib/supabase-server';
import { getProductBySku } from '../../../lib/supabase';
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
  const products = (await Promise.all(skus.map(sku => getProductBySku(sku)))).filter(Boolean);
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
