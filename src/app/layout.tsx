import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Noto_Sans_KR, Noto_Serif_KR, Saira_Condensed } from "next/font/google";
import "./globals.css";

// DESIGN.md 의 3가지 글꼴 역할: 제목(Display) / 본문(Text, 명조) / 버튼·라벨(Mono)
const display = Saira_Condensed({ weight: "400", subsets: ["latin"], variable: "--font-display-latin" });
const displayKr = Noto_Sans_KR({ weight: "400", subsets: ["latin"], variable: "--font-display-kr", preload: false });
const text = Noto_Serif_KR({ weight: "400", subsets: ["latin"], variable: "--font-text", preload: false });
const mono = JetBrains_Mono({ weight: "400", subsets: ["latin"], variable: "--font-mono-latin" });

export const metadata: Metadata = {
  title: "DCHOI09 — 전집 컨시어지",
  description: "dchoi09.com 전집 상담 챗봇",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${displayKr.variable} ${text.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
