import { createBusinessCardImage, SHARE_CARD_SIZE } from "./_og/business-card";
import { SITE_URL } from "@/lib/seo";

export const runtime = "edge";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

export default async function OG() {
  return createBusinessCardImage(SITE_URL);
}
