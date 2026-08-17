import type { Metadata, Viewport } from "next";
import "./site.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.minddy.app";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "minddy", template: "%s · minddy" },
  description: "An open-source issue tracker for small product teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
