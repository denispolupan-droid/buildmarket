import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Вход | FIXLINE',
  robots: { index: false, follow: false },
};

export default function RuLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
