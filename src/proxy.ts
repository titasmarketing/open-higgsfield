import { clerkMiddleware } from "@clerk/nextjs/server";

/* Search and install metadata stay readable without an account; every other
   page asks for one. API routes answer 401 themselves rather than redirect. */
const PUBLIC_PATHS = new Set(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/")) return;
  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
