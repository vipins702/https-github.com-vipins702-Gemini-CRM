// Outbound HTTP to a URL a user typed (workflow webhooks). Without these checks the server can be
// pointed at itself, at the cloud metadata service (169.254.169.254) or at anything on the private
// network, and it posts the record data there.
import dns from 'dns/promises';
import net from 'net';

const v4ToInt = (ip) => ip.split('.').reduce((n, o) => (n * 256) + Number(o), 0);
const inRange = (ip, base, bits) => {
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    return ((v4ToInt(ip) & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
};
const BLOCKED_V4 = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]];

/** True for loopback, private, link-local, metadata, multicast and reserved addresses. */
export function isPrivateAddress(ip) {
    const kind = net.isIP(ip);
    if (kind === 4) return BLOCKED_V4.some(([base, bits]) => inRange(ip, base, bits));
    if (kind === 6) {
        const a = ip.toLowerCase();
        const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith('ff');
    }
    return true; // not an address at all: refuse
}

/** Parse the URL, allow http(s) only, and refuse any host that is or resolves to a private address. */
export async function assertPublicHttpUrl(raw) {
    let u;
    try { u = new URL(String(raw)); } catch { throw new Error('Invalid URL'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https URLs are allowed');
    if (u.username || u.password) throw new Error('URLs with embedded credentials are not allowed');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
        if (isPrivateAddress(host)) throw new Error('URL points to a private or internal address');
        return u;
    }
    let addrs;
    try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('Host name could not be resolved'); }
    if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new Error('URL points to a private or internal address');
    return u;
}

/** fetch() for user-supplied URLs: checked first, short timeout, redirects are not followed. */
export async function safeFetch(raw, init = {}) {
    const u = await assertPublicHttpUrl(raw);
    return fetch(u, { ...init, redirect: 'manual', signal: AbortSignal.timeout(5000) });
}
