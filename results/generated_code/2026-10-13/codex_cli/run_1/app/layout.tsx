import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Local Chat",
  description: "Streaming chat with tools and durable conversations",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
