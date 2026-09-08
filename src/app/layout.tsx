import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = { variable: "--font-geist-sans" } as const;
const geistMono = { variable: "--font-geist-mono" } as const;

export const metadata: Metadata = {
  title: "ListenAI - Hoc tieng Anh thich ung",
  description:
    "He thong hoc tieng Anh thich ung voi AI - Luyen nghe, chep chinh ta, va hoc tu vung thong minh.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
