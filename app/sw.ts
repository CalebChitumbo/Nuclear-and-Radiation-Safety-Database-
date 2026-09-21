/**
 * The service worker — what lets the app OPEN at a post with no signal.
 *
 * Firestore's persistent cache (lib/firebase.ts) keeps the data and the write
 * queue on the device, but the page itself still had to come from the
 * network: close the tab at a post with no signal and the app would not load
 * again until there was one. This worker keeps the built app on the device —
 * the static bundles are precached at install, and the pages an officer has
 * opened are kept as they are visited — so `/border` opens from the cache and
 * Firestore takes it from there.
 *
 * Built by @serwist/next into public/sw.js (git-ignored) on `next build`;
 * off in development.
 */
import { defaultCache, PAGES_CACHE_NAME } from "@serwist/next/worker";
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * At a post with a bar of signal and no throughput, a network-first fetch
 * with no limit waits on the browser's own timeout — minutes, on some phones.
 * Give the network this long for a page and then serve what the device has.
 */
const PAGE_TIMEOUT_SECONDS = 5;

const runtimeCaching: RuntimeCaching[] = [
  // Firebase's own traffic is never cached here: Firestore keeps its own
  // cache and queue, and its listen streams and the auth token exchange are
  // not responses to keep. The default list below would otherwise put them
  // through a network-first cache.
  {
    matcher: ({ url }) =>
      url.hostname.endsWith("googleapis.com") ||
      url.hostname.endsWith("firebaseapp.com") ||
      url.hostname.endsWith("cloudfunctions.net"),
    handler: new NetworkOnly(),
  },
  // The app's pages, with the timeout. Same cache names as the defaults so a
  // page cached by one rule is found by the other.
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("RSC") === "1" &&
      sameOrigin &&
      !pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE_NAME.rsc,
      networkTimeoutSeconds: PAGE_TIMEOUT_SECONDS,
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("Content-Type")?.includes("text/html") === true &&
      sameOrigin &&
      !pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE_NAME.html,
      networkTimeoutSeconds: PAGE_TIMEOUT_SECONDS,
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new deploy takes over open tabs on their next load rather than waiting
  // for every tab to close — a post keeps one tab open for days.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
