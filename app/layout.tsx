import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "InterviewIQ — Your AI interview, live.",
  description:
    "A real-time, AI-powered mock interview. An animated interviewer speaks, listens and watches — then tells you the truth about how you did.",
  metadataBase: new URL("https://interviewiq.app"),
  openGraph: {
    title: "InterviewIQ",
    description:
      "A real-time, AI-powered mock interview that adapts to your voice, your face and your story.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
