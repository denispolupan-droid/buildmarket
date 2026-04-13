import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "FixHub — будівельна хімія оптом",
  description: "Оптовий продаж клеїв, герметиків, монтажних пін. Від 1 упаковки.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body style={{margin:0,padding:0,fontFamily:'Inter, system-ui, sans-serif',background:'#F6F8FB'}}>
        <Header />
        {children}
      </body>
    </html>
  );
}