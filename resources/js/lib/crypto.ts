/**
 * lib/crypto.ts: the vault.
 *
 * The format is fixed by the reference implementation and the API contract: AES-GCM 256,
 * a key derived with PBKDF2-SHA256 over the passphrase and the vault's own salt, and an
 * envelope written as "enc:v1:" followed by base64 of iv || ciphertext || tag. The known
 * string sealed into the vault row is 'notebook-vault-check-v1'.
 *
 * Two properties are load-bearing and are preserved here:
 *
 *   1. The derived key is non-extractable. It can encrypt and decrypt and can never be
 *      exported back out of crypto.subtle, so the key material does not exist as bytes
 *      anywhere in the page.
 *   2. The envelope carries its own marker, so a stored value with the marker is
 *      ciphertext and a value without it is plaintext, by definition. That is what makes
 *      double encryption impossible to express and legacy plaintext readable with no
 *      migration.
 *
 * A third property is about the server rather than the format: 'off' is reported only after a
 * read of the vault row has answered and said there is none. A read that failed leaves the
 * state unknown, and an unknown vault refuses every write, because treating an unreadable
 * vault as an absent one is exactly how prose gets written into a sealed notebook.
 *
 * A 401 has nothing to do with this file: the passphrase never leaves the browser.
 */

import type { Vault } from '../types';

export const ENVELOPE_PREFIX = 'enc:v1:';

/** The PBKDF2 cost a new vault is sealed with: the OWASP figure for PBKDF2-SHA256. */
export const DEFAULT_ITERATIONS = 600000;

/** The one sealed value that proves a derived key is the vault's key. */
export const CHECK_TEXT = 'notebook-vault-check-v1';

const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The range of stored iteration counts this module will honour. Below the floor the
 * derivation is cheap enough to make guessing worthwhile; above the ceiling one unlock
 * would occupy the tab for minutes. Both ends sit orders of magnitude away from anything
 * this app writes, so a count outside them is evidence of damage, not a preference.
 */
const MIN_ITERATIONS = 1000;
const MAX_ITERATIONS = 10000000;

/**
 * How the vault stands right now.
 *
 * 'off' is a fact about the server, never a default: it means a read of the vault row came
 * back and said there is none. 'unknown' means no such read has succeeded, which covers both
 * the moment before the first answer and every read that failed. The two must not be
 * conflated: one is a notebook without a vault, the other is a notebook whose state nobody
 * knows, and only the first may be written to as plaintext.
 */
export type VaultStatus = 'off' | 'locked' | 'unlocked' | 'unknown';

let key: CryptoKey | null = null;
let vault: Vault | null = null;

/** Whether a read of the vault row has answered at all. */
let known = false;

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('This browser does not expose WebCrypto, so notes cannot be encrypted or decrypted here.');
  }
  return cryptoObj.subtle;
}

function toBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

export function randomBytes(count: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether a stored value carries the envelope marker. Everything else is plaintext. */
export function isEnvelope(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX);
}

// ------------------------------------------------------------------- status

/** The parameters the last read or write of the vault row recorded. */
export function vaultRow(): Vault | null {
  return vault;
}

export function status(): VaultStatus {
  // Nothing is known until a read says so, and a failed read puts it back to nothing known.
  // Reporting 'off' here is what let a sealed notebook be saved as plaintext.
  if (!known) return 'unknown';
  if (!vault || !vault.configured) return 'off';
  return key ? 'unlocked' : 'locked';
}

export function isUnlocked(): boolean {
  return key !== null;
}

export function lock(): void {
  key = null;
}

/**
 * Record what the server holds. This is the only path that may report the vault as off,
 * because it is the only one that carries an answer. A vault that is gone drops the key with
 * it: a key with no parameters behind it could only seal records nothing can open again.
 */
export function setVault(row: Vault | null): void {
  const configured = !!row && !!row.salt && !!row.check_ct;
  vault = configured && row ? row : null;
  known = true;
  if (!configured) key = null;
}

/**
 * Record that the vault row could not be read.
 *
 * An unreadable row is not an absent one, and that difference is the whole point of this
 * function: the state goes back to unknown so that every write refuses, and the key, if one
 * was already installed, is kept rather than dropped, because a later read may well succeed.
 */
export function markVaultUnknown(): void {
  known = false;
}

function normaliseIterations(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ITERATIONS;
  const whole = Math.floor(n);
  return whole >= MIN_ITERATIONS && whole <= MAX_ITERATIONS ? whole : DEFAULT_ITERATIONS;
}

/**
 * The count read back out of a stored vault row: validated, never repaired. This number is
 * not authenticated, so quietly substituting the default would derive a key the vault was
 * never sealed under and then report the failure as a wrong password.
 */
function readStoredIterations(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < MIN_ITERATIONS || n > MAX_ITERATIONS) {
    throw new Error('The vault metadata is damaged: the stored key derivation count is missing or out of range.');
  }
  return n;
}

// ------------------------------------------------------------------ derivations

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const api = subtle();
  const base = await api.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return api.deriveKey(
    { name: 'PBKDF2', salt: toBytes(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    // Non-extractable on purpose: the key can be used and never read back out.
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sealBytes(withKey: CryptoKey, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv: toBytes(iv) }, withKey, toBytes(bytes));
  const packed = new Uint8Array(iv.byteLength + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.byteLength);
  return ENVELOPE_PREFIX + bytesToBase64(packed);
}

function splitEnvelope(value: string): { iv: Uint8Array<ArrayBuffer>; body: Uint8Array<ArrayBuffer> } {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(value.slice(ENVELOPE_PREFIX.length));
  } catch {
    throw new Error('An encrypted record could not be read: its stored form is not valid base64. It may be damaged.');
  }
  if (bytes.byteLength < IV_BYTES + TAG_BYTES) {
    throw new Error('An encrypted record is truncated, so it cannot be decrypted.');
  }
  return { iv: toBytes(bytes.subarray(0, IV_BYTES)), body: toBytes(bytes.subarray(IV_BYTES)) };
}

async function openBytes(withKey: CryptoKey, value: string): Promise<Uint8Array<ArrayBuffer>> {
  const parts = splitEnvelope(value);
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: parts.iv }, withKey, parts.body);
    return new Uint8Array(plain);
  } catch {
    throw new Error('An encrypted record could not be decrypted: it may be damaged, or it may have been written with a different passphrase.');
  }
}

/** What a caller commits to the vault row after the local key is installed. */
export interface VaultDraft {
  salt: string;
  iterations: number;
  check_iv: string;
  check_ct: string;
}

/**
 * Turn the vault on: derive a key from the passphrase, seal the known string under it and
 * hand back the row the caller has to PUT. Nothing is committed here, so a failure leaves
 * the notebook exactly as it was.
 */
export async function setupVault(passphrase: string): Promise<VaultDraft> {
  const salt = randomBytes(SALT_BYTES);
  const iterations = normaliseIterations(DEFAULT_ITERATIONS);
  const derived = await deriveKey(passphrase, salt, iterations);
  const iv = randomBytes(IV_BYTES);
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv: toBytes(iv) }, derived, new TextEncoder().encode(CHECK_TEXT));
  const draft: VaultDraft = {
    salt: bytesToBase64(salt),
    iterations,
    check_iv: bytesToBase64(iv),
    check_ct: bytesToBase64(new Uint8Array(cipher)),
  };
  // Provisional until the caller confirms the PUT landed.
  key = derived;
  return draft;
}

/** The vault row was committed: the provisional key is now the notebook's key. */
export function commitVault(draft: VaultDraft): Vault {
  const row: Vault = {
    salt: draft.salt,
    iterations: draft.iterations,
    check_iv: draft.check_iv,
    check_ct: draft.check_ct,
    configured: true,
  };
  vault = row;
  known = true;
  return row;
}

/** The commit failed: drop the provisional key. Nothing was written, so nothing is undone. */
export function cancelSetup(): void {
  key = null;
}

/**
 * Verify a passphrase against the stored vault and install the derived key.
 *
 * The verification IS the decryption: the known string is opened with the derived key, and
 * the GCM tag makes that succeed only under the right key. Nothing compares the passphrase,
 * or a hash of it, to anything.
 */
export async function unlockVault(row: Vault, passphrase: string): Promise<void> {
  if (!row.salt || !row.check_iv || !row.check_ct) {
    throw new Error('The vault record is damaged: it has no salt or no check value.');
  }

  let salt: Uint8Array<ArrayBuffer>;
  let iv: Uint8Array<ArrayBuffer>;
  let ct: Uint8Array<ArrayBuffer>;
  try {
    salt = base64ToBytes(row.salt);
    iv = base64ToBytes(row.check_iv);
    ct = base64ToBytes(row.check_ct);
  } catch {
    throw new Error('The vault record is damaged: its stored salt or check value is not readable.');
  }
  if (salt.byteLength !== SALT_BYTES) {
    throw new Error('The vault record is damaged: the stored salt is the wrong length.');
  }
  if (iv.byteLength !== IV_BYTES || ct.byteLength <= TAG_BYTES) {
    throw new Error('The vault record is damaged: the stored check value is the wrong length.');
  }

  const iterations = readStoredIterations(row.iterations);
  const derived = await deriveKey(passphrase, salt, iterations);
  try {
    await subtle().decrypt({ name: 'AES-GCM', iv }, derived, ct);
  } catch {
    throw new Error('That passphrase is not the one this notebook was encrypted with.');
  }
  key = derived;
  vault = { ...row, configured: true };
  known = true;
}

// ------------------------------------------------------------------- read/write

/**
 * Seal text when the vault is unlocked. With the vault off the text is returned unchanged,
 * which is what lets a caller stay branch-free, and that is the only state that gives the
 * value back untouched: a locked vault and a vault whose state could not be read both refuse,
 * because the alternative is readable prose written into a sealed notebook.
 *
 * A value that already carries the envelope marker is refused in every state, before the
 * vault is even consulted. Sealing it writes ciphertext inside ciphertext and passing it
 * through stores ciphertext where text is expected, and neither can be undone, so neither is
 * expressible here.
 */
export async function sealText(text: string): Promise<string> {
  if (isEnvelope(text)) {
    throw new Error('This value is already sealed, and sealing it again would destroy it. Nothing was written.');
  }
  const state = status();
  if (state === 'off') return text;
  if (state === 'unknown') {
    throw new Error('The vault could not be read, so this notebook is not saving anything until it can be. Nothing was written.');
  }
  if (state === 'locked' || !key) {
    throw new Error('This notebook is locked. Unlock it with your passphrase before saving.');
  }
  return sealBytes(key, new TextEncoder().encode(text));
}

/**
 * Open a stored value. Plaintext passes straight through, by definition.
 *
 * This is the only way a sealed body becomes readable and the only thing that may hand a body
 * to the editor. What it returns is plaintext and what it was given is what the next save
 * seals, so a caller never handles an envelope as though it were the note.
 */
export async function openText(value: string): Promise<string> {
  if (!isEnvelope(value)) return value;
  const state = status();
  if (state === 'unknown') {
    throw new Error('The vault could not be read, so this sealed record was not opened. Nothing was changed.');
  }
  if (state !== 'unlocked' || !key) {
    throw new Error('An encrypted record is here, but this notebook is locked. Unlock it to read the note.');
  }
  const bytes = await openBytes(key, value);
  return new TextDecoder().decode(bytes);
}

/** Seal file bytes. The envelope is a string, which is what carries the marker. */
export async function sealBytesForUpload(bytes: Uint8Array): Promise<string> {
  const state = status();
  if (state === 'off') return bytesToBase64(bytes);
  if (state === 'unknown') {
    throw new Error('The vault could not be read, so nothing was sealed. This file was not uploaded.');
  }
  if (state === 'locked' || !key) {
    throw new Error('This notebook is locked. Unlock it with your passphrase before attaching a file.');
  }
  return sealBytes(key, toBytes(bytes));
}
