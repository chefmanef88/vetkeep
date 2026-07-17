import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VetKeep",
  description: "Secure clinical records for independent veterinarians"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
