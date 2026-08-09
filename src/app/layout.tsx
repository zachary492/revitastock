import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniSync — Inventory Drift Detection",
  description:
    "Catch ghost listings and phantom drops before they cost you a sale.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
