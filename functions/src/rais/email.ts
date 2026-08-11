/**
 * Inbound-email webhook helpers — provider-agnostic and framework-free.
 *
 * Works with the common inbound-parse providers an officer might forward the
 * RAIS notification mail to:
 *   • CloudMailin  — posts JSON ({ headers, plain, html, … }).
 *   • Mailgun      — posts form fields (body-plain / stripped-text / subject …)
 *                    plus an HMAC signature (timestamp + token + signature).
 *   • SendGrid etc — posts form fields (text / html / subject / from).
 *
 * Only Node's `crypto` is imported, so this module is pure and can be unit
 * tested without the Functions/Firebase runtime.
 */
import { createHmac, timingSafeEqual } from "crypto";

export interface InboundRequest {
  /** Lowercased request headers (as Express exposes them). */
  headers: Record<string, string | undefined>;
  query: Record<string, unknown>;
  /** Parsed body (JSON or urlencoded form fields). */
  body: Record<string, unknown>;
}

export interface ParsedEmail {
  subject: string;
  text: string;
  from: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** First non-empty string among the given body keys (case-sensitive lookups). */
function firstField(body: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = str(body[k]).trim();
    if (v) return v;
  }
  return "";
}

/** Crude but dependency-free HTML→text fallback for HTML-only emails. */
export function htmlToText(html: string): string {
  return str(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Pull the subject, plain-text body and sender out of whatever shape the
 * provider posted. Prefers a provider's pre-stripped plaintext, then any
 * plaintext field, then an HTML body converted to text.
 */
export function pickEmailText(body: Record<string, unknown>): ParsedEmail {
  // CloudMailin's JSON format nests the subject/from under `headers`.
  const headers = (body.headers && typeof body.headers === "object"
    ? (body.headers as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  // CloudMailin also reports the SMTP envelope sender separately from the header.
  const envelope = (body.envelope && typeof body.envelope === "object"
    ? (body.envelope as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const subject =
    firstField(body, ["subject", "Subject"]) || str(headers.subject).trim();
  const from =
    firstField(body, ["from", "sender", "From", "Sender", "from_email"]) ||
    str(headers.from).trim() ||
    str(headers.From).trim() ||
    str(envelope.from).trim();

  let text = firstField(body, [
    "stripped-text", // Mailgun, signature/quote removed
    "body-plain", // Mailgun
    "plain", // CloudMailin
    "text", // SendGrid / generic
    "text_body",
  ]);

  if (!text) {
    const html = firstField(body, ["stripped-html", "body-html", "html", "html_body"]);
    if (html) text = htmlToText(html);
  }

  return { subject, text: text.trim(), from };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Reject Mailgun signatures older than this — bounds replay of a captured request. */
const MAILGUN_MAX_SKEW_SECONDS = 5 * 60;

/** Mailgun HMAC: signature == HMAC-SHA256(signingKey, timestamp + token). */
export function verifyMailgunSignature(
  sig: { timestamp?: string; token?: string; signature?: string },
  signingKey: string,
  nowMs: number = Date.now(),
): boolean {
  if (!signingKey || !sig.timestamp || !sig.token || !sig.signature) return false;
  // Freshness first: a captured signed request must not replay forever.
  const ts = Number(sig.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs / 1000 - ts) > MAILGUN_MAX_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", signingKey)
    .update(sig.timestamp + sig.token)
    .digest("hex");
  return timingSafeEqualStr(expected, sig.signature);
}

/** Read a Mailgun signature triple whether posted flat or nested under `signature`. */
function readMailgunSignature(
  body: Record<string, unknown>,
): { timestamp?: string; token?: string; signature?: string } {
  const nested =
    body.signature && typeof body.signature === "object"
      ? (body.signature as Record<string, unknown>)
      : undefined;
  if (nested) {
    return {
      timestamp: str(nested.timestamp),
      token: str(nested.token),
      signature: str(nested.signature),
    };
  }
  return {
    timestamp: str(body.timestamp),
    token: str(body.token),
    signature: str(body.signature),
  };
}

/** The shared secret presented on the request, if any (header / basic-auth / query / body). */
function presentedSecret(req: InboundRequest): string {
  const headerSecret =
    str(req.headers["x-webhook-secret"]).trim() ||
    str(req.headers["x-rais-secret"]).trim();
  if (headerSecret) return headerSecret;

  const auth = str(req.headers["authorization"]).trim();
  if (/^Basic\s+/i.test(auth)) {
    try {
      const decoded = Buffer.from(auth.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass) return pass;
    } catch {
      /* ignore malformed header */
    }
  }

  return str(req.query.secret).trim() || str(req.body.secret).trim();
}

/**
 * Sender allowlist: is `from` (a raw From header, possibly "Name <a@b.c>")
 * from one of the allowed senders? Entries may be full addresses
 * ("noreply@rais.rpa.gov.zm") or bare domains ("rais.rpa.gov.zm", which also
 * admits subdomains). An empty allowlist admits everyone (feature off).
 */
export function senderAllowed(from: string, allowlist: string[]): boolean {
  const entries = allowlist.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!entries.length) return true;
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(from || "");
  const bare = /([^<>\s"',;]+@[^<>\s"',;]+)/.exec(from || "");
  const addr = (angled?.[1] || bare?.[1] || "").toLowerCase();
  if (!addr) return false;
  const domain = addr.slice(addr.lastIndexOf("@") + 1);
  return entries.some((e) =>
    e.includes("@") ? addr === e : domain === e || domain.endsWith(`.${e}`),
  );
}

export interface AuthConfig {
  /** Required shared secret. */
  secret: string;
  /** Optional Mailgun HTTP-webhook signing key for HMAC verification. */
  mailgunSigningKey?: string;
}

/**
 * Authorize an inbound webhook. A valid Mailgun HMAC signature is accepted when
 * a signing key is configured; otherwise the shared secret must be presented
 * (header `X-Webhook-Secret`, HTTP basic-auth password, `?secret=`, or a
 * `secret` form field). Returns true only on a positive match.
 */
export function isAuthorized(req: InboundRequest, cfg: AuthConfig): boolean {
  if (cfg.mailgunSigningKey) {
    const sig = readMailgunSignature(req.body);
    if (sig.signature && verifyMailgunSignature(sig, cfg.mailgunSigningKey)) {
      return true;
    }
  }
  if (!cfg.secret) return false;
  const presented = presentedSecret(req);
  return !!presented && timingSafeEqualStr(presented, cfg.secret);
}
