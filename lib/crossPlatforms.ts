// Platforms a product can also be tracked on. Flipkart is intentionally excluded.
export const CROSS_PLATFORMS = [
  { id: "amazon",          label: "Amazon",           example: "https://www.amazon.in/dp/..." },
  { id: "croma",           label: "Croma",            example: "https://www.croma.com/.../p/123456" },
  { id: "reliancedigital", label: "Reliance Digital", example: "https://www.reliancedigital.in/.../p/123456" },
  { id: "poorvika",        label: "Poorvika",         example: "https://www.poorvika.com/..." },
] as const;

export type CrossPlatformId = typeof CROSS_PLATFORMS[number]["id"];

export function isCrossPlatform(p: string): p is CrossPlatformId {
  return CROSS_PLATFORMS.some((c) => c.id === p);
}