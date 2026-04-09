import type { Metadata } from "next";
import { Syne, DM_Sans, DM_Mono } from "next/font/google"
import "./globals.css"

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-syne",
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
})

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
})

// export const metadata: Metadata = {
//   title: "PriceHound",
//   description: "Never Overpay Again - Your Ultimate Price Comparison Companion",
// };

export const metadata: Metadata = {
  title: {
    default: "PriceHound",
    template: "%s | Your Ultimate Price Comparison Companion",
  },
  icons: {
    icon: "/logo.png",
  },
  openGraph: {
    title: "PriceHound | Everything You Need to Know About Your Purchases",
    description: "Your Ultimate Price Comparison Companion",
    url: "https://pricehoundz.vercel.app",
    siteName: "PriceHound",
    images: [
      {
        url: "https://pricehoundz.vercel.app/logo.png", 
        width: 1000,
        height: 550,
        alt: "PriceHoundZ preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PriceHound | Your Ultimate Price Comparison Companion",
    description: "Your Ultimate Price Comparison Companion",
    images: ["https://pricehoundz.vercel.app/logo.png"],
  },
  // description: "Your Brand, Your Story, Your Sales. All in One Link",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}