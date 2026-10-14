import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PeopleOps Copilot",
  description:
    "A fictional HR policy assistant with source citations and human-controlled workflows.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
