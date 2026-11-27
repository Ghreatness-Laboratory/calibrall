export const LOCAL_SESSION_COOKIE_NAME = 'calibrall_local_session';
export const LOCAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocalSessionTokenPayload {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  tier: 'free' | 'pro' | 'premium';
  tierExpiresAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  exp: number;
}

function getLocalAuthSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    'calibrall-local-dev-auth-secret-key'
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importHmacKey(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getLocalAuthSecret());
  return globalThis.crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signLocalSessionToken(
  payload: LocalSessionTokenPayload
): Promise<string> {
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey();
  const sigBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const encodedSig = toBase64Url(new Uint8Array(sigBuffer));
  return `${encodedPayload}.${encodedSig}`;
}

export async function verifyLocalSessionToken(
  token: string | undefined | null
): Promise<LocalSessionTokenPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  try {
    const key = await importHmacKey();
    const sigBytes = fromBase64Url(encodedSig);
    const sigBuffer = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength
    ) as ArrayBuffer;
    const ok = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBuffer,
      new TextEncoder().encode(encodedPayload)
    );
    if (!ok) return null;

    const payloadJson = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const parsed = JSON.parse(payloadJson) as LocalSessionTokenPayload;
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isLocalAuthAllowed(): boolean {
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV === 'production') {
    return false;
  }
  const url = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  );
  const anonKey = (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ''
  );
  const hasUrl = Boolean(url && url.startsWith('https://') && !url.includes('your-project-id'));
  return !(hasUrl && anonKey);
}
