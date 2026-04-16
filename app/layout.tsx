import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "FIXLINE — будівельна хімія оптом | B2B платформа",
  description: "B2B платформа для оптових закупівель будівельної хімії. Герметики, монтажні піни, клеї. Оптові ціни для дилерів, магазинів та підрядників.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <Header />
        <main style={{minHeight:'100vh'}}>
          {children}
        </main>
      </body>
    </html>
  );
}
