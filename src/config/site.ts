// src/config/site.ts (or wherever)
export const SITE = {
  name: "Velcrafting",
  // Steven, 2026-09-16: "hello@ and steven@ velcrafting.com both work, but i think steven@ feels
  // more... inviting? more personal?" Both resolve, so this is a preference, not a fix. One value,
  // used by the sidebar icon, the mobile header, the vCard and the structured data — change it here
  // and every surface follows.
  email: "steven@velcrafting.com",
  resumeUrl: "/Steven_Pajewski_Resume.pdf",
  // Verified public booking page: resolves to Steven's 30-minute meeting page.
  // Single source for the scheduling destination so /connect and the contact
  // page cannot drift apart.
  bookingUrl: "https://cal.com/spajewski/30min",
  links: {
    linkedin: "https://linkedin.com/in/spajewski",
    github: "https://github.com/velcrafting/",
    // The Discord invite is PUBLIC data, but it lives in an environment variable so it can be set
    // once at deploy time rather than edited in code. Steven, 2026-09-16: "really i would think this
    // should be considered like an .env variable... if it is a .env item i could just easily input
    // it onto vercel when we are uploaded." Exactly that: set NEXT_PUBLIC_DISCORD_INVITE in Vercel
    // (and in a local .env for local work) and the control goes live with no code change.
    // NEXT_PUBLIC_ because the value is public by nature and may be needed on the client later; it
    // is an invite link, not a secret. Empty means the honest disabled state.
    discord: process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "",
  },
} as const;
