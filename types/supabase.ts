// types/supabase.ts
// Auto-matches the schema.sql tables — use these throughout the app

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Platform = "amazon" | "flipkart" | "reliancedigital" | "croma" | "poorvika" | "other";

export type CrossPlatformPrice = {
  id:             string;
  product_id:     string;
  user_id:        string;
  platform:       Platform;
  url:            string;
  name:           string | null;
  image_url:      string | null;
  current_price:  number | null;
  confirmed:      boolean;
  ai_confidence:  number | null;
  ai_reasoning:   string | null;
  is_active:      boolean;
  created_at:     string;
  updated_at:     string;
};

export type CrossPriceHistory = {
  id:                 string;
  cross_platform_id:  string;
  product_id:         string;
  platform:           Platform;
  price:              number;
  scraped_at:         string;
};

export type TrackedProduct = {
  id: string;
  user_id: string;
  url: string;
  name: string | null;
  image_url: string | null;
  platform: Platform | null;
  target_price: number;
  current_price: number | null;
  is_active: boolean;
  notify_sent: boolean;
  created_at: string;
  updated_at: string;
};

export type PriceHistory = {
  id: string;
  product_id: string;
  price: number;
  scraped_at: string;
};

export type NotificationLog = {
  id: string;
  product_id: string;
  user_id: string;
  sent_at: string;
  price: number;
  email: string;
};

// Joined type used in the dashboard
export type ProductWithHistory = TrackedProduct & {
  price_history: PriceHistory[];
};