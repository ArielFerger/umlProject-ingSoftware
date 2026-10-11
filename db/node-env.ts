// Next.js on Vercel uses browser-owned storage. Cloudflare bindings exist only
// in the Worker build; never substitute an unauthenticated shared database.
export const env = Object.freeze({});
