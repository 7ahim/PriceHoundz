import type { Platform } from "@/types/supabase";

export function detectPlatform(url: string): Platform {
  if (url.includes("amazon.in") || url.includes("amazon.com")) return "amazon";
  if (url.includes("flipkart.com"))          return "flipkart";
  if (url.includes("myntra.com"))            return "myntra";
  if (url.includes("reliancedigital.in"))    return "reliancedigital";
  if (url.includes("croma.com"))             return "croma";
  if (url.includes("poorvika.com"))          return "poorvika";
  if (url.includes("meesho.com"))            return "meesho";
  return "other";
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

export function getPriceDiff(
  current: number | null,
  target: number
): { pct: number; met: boolean } | null {
  if (current == null) return null;
  const pct = ((current - target) / target) * 100;
  return { pct, met: current <= target };
}

export function getPlatformLabel(platform: string | null): string {
  switch (platform) {
    case "amazon":          return "Amazon";
    case "flipkart":        return "Flipkart";
    case "myntra":          return "Myntra";
    case "reliancedigital": return "Reliance Digital";
    case "croma":           return "Croma";
    case "poorvika":        return "Poorvika";
    case "meesho":          return "Meesho";
    default:                return "Other";
  }
}

export function getPlatformColor(platform: string | null): string {
  switch (platform) {
    case "amazon":          return "#ff9900";
    case "flipkart":        return "#2874f0";
    case "myntra":          return "#ff3f6c";
    case "reliancedigital": return "#e2231a";
    case "croma":           return "#00a6a0"; // Croma teal
    case "poorvika":        return "#e8251a"; // Poorvika red
    case "meesho":          return "#f43397"; // Meesho pink
    default:                return "#9a9a9a";
  }
}

export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)    return "just now";
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}