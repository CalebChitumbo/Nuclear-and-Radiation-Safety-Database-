/**
 * Admin SDK startup, shared by every script that talks to the live project.
 *
 * The scripts are run occasionally — a seed, a re-baseline, an audit when a
 * figure has moved — so the person running one has usually not run it before,
 * or not this year. The failure they hit is always the same: no credentials.
 * Left to the SDK that surfaces as a bare ENOENT stack trace, or as a
 * "Unable to detect a Project Id" from somewhere deep in the library, neither
 * of which says what to do next. So this checks first and says it plainly.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { existsSync, readFileSync } from "node:fs";

const KEY_HELP = `
No credentials found, so there is nothing to connect to.

The project's admin scripts authenticate with a service account key — a JSON
file you download once and keep out of git (.gitignore already covers it):

  1. Open the Firebase console:
     https://console.firebase.google.com/project/nrsd-imformation-management/settings/serviceaccounts/adminsdk
  2. "Generate new private key" → Generate key. A .json file downloads.
  3. Save it in the repo root as service-account.json

Then run the command again with:

  GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

That key is full administrative access to the live database — keep it on this
machine, off email and shared drives, and delete it in the console if it ever
leaves. (Against the local emulator, set FIRESTORE_EMULATOR_HOST=localhost:8080
and GOOGLE_CLOUD_PROJECT instead; no key is needed.)
`;

/**
 * Start the Admin SDK, or exit with an explanation. Against the emulator no
 * credentials are needed — FIRESTORE_EMULATOR_HOST is enough.
 */
export function initAdminApp(): void {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

  if (credPath) {
    if (!existsSync(credPath)) {
      console.error(
        `GOOGLE_APPLICATION_CREDENTIALS points at ${credPath}, which does not exist.\n${KEY_HELP}`,
      );
      process.exit(1);
    }
    initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, "utf-8"))) });
    return;
  }

  // No key named. Fine on the emulator, and fine if the machine carries
  // application-default credentials; otherwise it fails obscurely, so say so.
  if (!onEmulator && !process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT) {
    console.error(KEY_HELP.trim());
    process.exit(1);
  }
  initializeApp();
}
