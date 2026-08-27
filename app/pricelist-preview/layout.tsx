import type { Metadata } from 'next';

// Службовий перегляд прайсу (PDF/XLSX/лист) для адміна: не для індексу і без
// власного <html> — раніше layout рендерив другий <html><body> усередині
// кореневого, що давало невалідну розмітку з двома <head>.
export const metadata: Metadata = {
  title: 'Прайс-лист — перегляд',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
