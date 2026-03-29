// GRAV-CMS/app/layout.js
import ToastProvider from "@/components/ToastProvider"
import { Providers } from "./providers" // Import the new Providers component
import "./globals.css"

export const metadata = {
  title: {
    default: "Grav Clothing – Management System",
    template: "%s | Grav Clothing",
  },
  description:
    "Grav Clothing Management System helps manage inventory, production, orders, and custom apparel quotations efficiently. Designed for seamless clothing business operations in Bhubaneswar, Odisha.",

  keywords: [
    "Grav Clothing",
    "Clothing Management System",
    "Apparel ERP",
    "Inventory Management",
    "Custom Apparel Quotation",
    "Garment Manufacturing Software",
    "Bhubaneswar Clothing Brand",
  ],

  openGraph: {
    title: "Grav Clothing – Management System",
    description:
      "Manage inventory, production, orders, and custom clothing quotations with Grav Clothing’s centralized management system.",
    url: "https://grav.in",
    siteName: "Grav Clothing",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Grav Clothing Management System",
      },
    ],
    locale: "en_IN",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Grav Clothing – Management System",
    description:
      "A modern management system for Grav Clothing to handle apparel production, inventory, and custom order quotations.",
    images: ["/og-image.png"],
  },

  icons: {
    icon: "/og-image.png",
    shortcut: "/og-image.png",
    apple: "/og-image.png",
  },

  metadataBase: new URL("https://grav.in"),
  generator: "v0.app",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers> {/* Wrap everything with Providers */}
          <ToastProvider>
            {children}
          </ToastProvider>
        </Providers>
      </body>
    </html>
  )
}