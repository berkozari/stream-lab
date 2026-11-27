import { isIP } from 'node:net';

/** Only fixed proxy IPs/CIDRs are trusted; never trust every Forwarded/XFF sender. */
export function parseTrustedProxyCidrs(value: string): string[] {
  if (!value.trim()) return [];
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => !entry)) {
    throw new Error('TRUST_PROXY_CIDRS contains an empty entry');
  }

  return entries.map((entry) => {
    const pieces = entry.split('/');
    if (pieces.length > 2) {
      throw new Error('TRUST_PROXY_CIDRS must contain literal IP addresses or CIDRs');
    }
    const [address, bits] = pieces;
    const version = isIP(address ?? '');
    if (!version) {
      throw new Error('TRUST_PROXY_CIDRS must contain literal IP addresses or CIDRs');
    }
    if (bits === undefined) return address!;
    const maxBits = version === 4 ? 32 : 128;
    if (!/^\d{1,3}$/.test(bits)) {
      throw new Error('TRUST_PROXY_CIDRS has an invalid prefix length');
    }
    const prefix = Number(bits);
    if (prefix < 1 || prefix > maxBits) {
      throw new Error('TRUST_PROXY_CIDRS must not trust the entire Internet');
    }
    return `${address}/${prefix}`;
  });
}
