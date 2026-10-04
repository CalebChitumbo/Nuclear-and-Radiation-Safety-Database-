# Firestore read costs — the September 2026 bill

The Google Cloud bill for `nrsd-imformation-management` was **$43.22 for
1 Sep – 4 Oct 2026**, against $0.38 the month before. Billing reports it under
*App Engine* (that is where Firestore is billed); **$35.91 of it was the SKU
*Cloud Firestore Read Ops*** — documents read. Hosting, functions and storage
were not the cause.

## What read so much

Firestore bills every document a server query returns (50,000 a day free, then
about $0.03 per 100,000 in us-central1). Two habits of the app multiplied the
reads:

1. **The Border Scan Log re-read its windows after every truck saved** — the
   recent 4,000 scans behind the pickers, the reporting week's scans and the
   daily entries. That is several thousand documents per truck. The posts began
   logging in the app on 7 Sep at 850–1,000 trucks a day, and the bill ran at
   $2–4 a day from 9 to 20 Sep.
2. **Every screen re-read all its data whenever the window regained focus**
   (`useStoreData`). On a phone that is every return from the camera, WhatsApp
   or a call.

It fell to $0.20–0.55 a day on 21 Sep, when the offline Border Scan Log (PR #52)
turned on the persistent cache — most likely because a query repeated within
30 minutes on a device that holds the cache is billed only for what changed.
It was still the largest cost and grew with the scan volume (1,300–2,200 a day
by October).

## What changed (Oct 2026)

- **A saved scan reads nothing.** The live shift list (`watchTruckScansFor`)
  is laid over the week (`withLiveShift`) and the pickers' window
  (`mergeScans`), so the day, the week and "last seen" update as before without
  a read.
- **The scan windows are read from the server once a day per device**
  (`getDocsWithin` in `lib/store/firebaseStore.ts`, `ReadFreshness` in
  `lib/store/types.ts`) and come off the persistent cache after that. Head
  office's every-post week, which holds other posts' days the shift list does
  not, goes back at most every 30 minutes. The SharePoint export passes no
  freshness and always reads the server.
- **Focus refreshes at most every 5 minutes** (`FOCUS_REFRESH_AFTER_MS` in
  `lib/storeHooks.ts`). A screen still re-reads at once after the user's own
  change (`reload()`).

What officers see is unchanged, with one exception: a scan another device
logs for an *earlier* day appears in that device's week and pickers the next
day, not the next minute. Today's scans at the post are live on every device,
as before.

## Keeping it down

- Never re-read a window to show a write the screen already has — lay the
  write (or a live listener) over what is loaded.
- A new read of a growing collection (`truckScans`, `auditLog`,
  `dailyEntries`) is bounded, and if a screen opens often it passes
  `ReadFreshness`.
- A **budget alert** on the billing account (Billing → Budgets & alerts) is
  what catches the next one in days rather than at the end of the month.
