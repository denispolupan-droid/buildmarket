import { createSupabaseServer } from '../../../../lib/supabase-server';
import ProductView from '../ProductView';

// Оптовий перегляд картки: proxy.ts переписує сюди /product/<slug>?from=catalog
// (адреса в браузері та сама). Тут читаємо сесію — тому сторінка динамічна й
// поза спільним кешем; оптова ціна лише для оптового акаунта, як і раніше.
export const dynamic = 'force-dynamic';
export { generateMetadata } from '../page';

// Той самий набір, що в кошику й /catalog (оптові типи акаунта)
const WHOLESALE_TYPES = ['dealer', 'wholesale', 'contractor', 'shop_owner'];

export default async function ProductPageB2B({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const accountType = user?.app_metadata?.account_type as string | undefined;
  const isRetail = !WHOLESALE_TYPES.includes(accountType ?? '') || sp.from !== 'catalog';
  return <ProductView id={id} from={sp.from} isRetail={isRetail} />;
}
