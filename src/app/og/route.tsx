import { createBusinessCardImage, SHARE_CARD_SIZE } from "../_og/business-card";

export const runtime = "edge";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

export async function GET(req: Request) {
  return createBusinessCardImage(new URL(req.url).origin);
}
