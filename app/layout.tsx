import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";

import { QueryProvider } from "@/components/providers/QueryProvider";
import "../styles/globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-sans-face",
});

export const metadata: Metadata = {
  title: "เส้นทางน้ำกรุงเทพมหานคร",
  description:
    "แผนที่เส้นทางน้ำ ระดับน้ำ และสถานีสูบน้ำ กรุงเทพมหานคร จาก สนน.กทม. และ ThaiWater (สสน.)",
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body suppressHydrationWarning>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
