/**
 * tools.js — the built-in tools, and the schemas the model is told they exist as.
 *
 * Split by where a tool can actually run:
 *
 *   - **Network tools** live here and are executed by the service worker, which already
 *     owns every cross-origin fetch. `search_web` and `read_page`.
 *   - **The page tool** is `update_chat_title`, declared below but executed in the page —
 *     it writes to IndexedDB and repaints the title, and neither is reachable from the
 *     worker. See `src/ui/lib/page-tools.js`.
 *
 * The page imports `TOOL_SCHEMAS` from here and sends them with each request. The worker
 * executes only what is in `NETWORK_TOOLS`; anything else is forwarded to the page, which
 * is what keeps this file free of DOM and database code.
 *
 * Every tool returns a **string**, because that is what goes back to the model in the
 * `tool` message. Callers that want structure parse it.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** DuckDuckGo's keyless HTML endpoint. No account, no API key. */
const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/?q=';

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web and return titles, links and snippets. Use this when the answer ' +
        'depends on current information, on a specific site, or on anything you were not ' +
        'given. Follow up with read_page on a promising link to read the page itself.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query. Plain keywords work better than questions.',
          },
          count: {
            type: 'integer',
            description: 'How many results to return, 1 to 10. Defaults to 5.',
            minimum: 1,
            maximum: 10,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_page',
      description:
        'Fetch a web page and return its readable text, with navigation, scripts and ' +
        'markup removed. Use it on a URL from search_web to read the detail rather than ' +
        'the snippet. Long pages are truncated.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'An absolute https URL.',
          },
          max_chars: {
            type: 'integer',
            description: 'Characters of text to return, up to 20000. Defaults to 8000.',
            minimum: 500,
            maximum: 20000,
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_chat_title',
      description:
        'Rename the current chat. Use it once, early, with a short title that names the ' +
        'subject of the conversation — not the user\'s question.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A short title, ideally under 60 characters.',
          },
        },
        required: ['title'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/** The tools this context can execute without the page. */
export const NETWORK_TOOLS = { search_web, read_page };

/**
 * Runs a network tool by name.
 *
 * @returns {Promise<string>} the result string handed back to the model.
 * @throws {Error} a message the model can act on — a thrown tool error becomes a `tool`
 *   message saying what went wrong, which the model can then route around.
 */
export async function runNetworkTool(name, args) {
  const tool = NETWORK_TOOLS[name];
  if (!tool) throw new Error(`No such tool: ${name}`);
  return tool(args ?? {});
}

// ---------------------------------------------------------------------------
// search_web
// ---------------------------------------------------------------------------

/**
 * Appended to every way a search can fail.
 *
 * A model told to search before it answers will, on a failure, try again with another query,
 * and each try is a round of the tool loop. The advice goes in the tool result because that is
 * the one place that always reaches the model: the system prompt is seeded into IndexedDB on
 * first run and never refreshed, so a sentence added to it would not reach an existing install.
 */
const SEARCH_ADVICE =
  ' If searching keeps failing, stop searching: answer from what you already know and say ' +
  'plainly that you could not search.';

async function search_web({ query, count } = {}) {
  const q = String(query ?? '').trim();
  if (!q) throw new Error('search_web needs a query.');

  const limit = clamp(Number.parseInt(count, 10) || 5, 1, 10);

  const response = await fetch(SEARCH_ENDPOINT + encodeURIComponent(q), {
    headers: {
      // DuckDuckGo serves a stripped page to clients that do not identify themselves.
      'Accept': 'text/html',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Search failed: DuckDuckGo returned ${response.status}.${SEARCH_ADVICE}`);
  }

  const html = await response.text();
  const results = parseSearchResults(html).slice(0, limit);

  if (!results.length) {
    // A distinct message matters: "no results" and "the parser broke" look identical from
    // outside, and only one of them is the model's fault to work around.
    throw new Error(
      `No results for "${q}". The search backend may be rate-limiting, or its page ` +
        `structure may have changed.${SEARCH_ADVICE}`,
    );
  }

  return JSON.stringify({ query: q, results }, null, 2);
}

/**
 * Extracts results from DuckDuckGo's HTML endpoint.
 *
 * Anchors are matched generically and then filtered by class, rather than by assuming the
 * class attribute comes before `href`. Attribute order in generated markup is not
 * something to depend on.
 *
 * **This is the fragile part of the extension.** It reads a third party's HTML with no
 * API contract behind it. If the search tool starts returning nothing, this function is
 * where to look.
 */
export function parseSearchResults(html) {
  /** Anchors in document order, tagged with where they appeared. */
  const entries = [];

  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const [, attrs, inner] = match;

    // Position is read off `match` rather than a destructured element. `.index` belongs
    // to the match array, not to the matched string — destructure the string instead and
    // every entry lands at 0, which silently breaks snippet pairing.
    const cls = /\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const href = /\bhref="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const value = oneLine(decodeEntities(stripTags(inner)));
    if (!value) continue;

    if (cls.includes('result__a')) {
      const url = unwrapResultUrl(href);
      if (url) entries.push({ at: match.index, kind: 'title', title: value, url });
    } else if (cls.includes('result__snippet')) {
      entries.push({ at: match.index, kind: 'snippet', snippet: value });
    }
  }

  const titles = entries.filter((e) => e.kind === 'title');

  // A snippet is paired with the title it *follows*, bounded by the next title — not by
  // its own index. Pairing by index silently shifts every snippet up one when a single
  // result has no snippet, which puts the wrong text under the wrong link.
  return titles.map((entry, i) => {
    const after = entries.find(
      (e) => e.kind === 'snippet' && e.at > entry.at && e.at < (titles[i + 1]?.at ?? Infinity),
    );
    return { title: entry.title, url: entry.url, snippet: after?.snippet ?? '' };
  });
}

/**
 * DuckDuckGo wraps result links in a redirect. The real URL is in the `uddg` parameter,
 * and the href is HTML-escaped, so it has to be decoded before the parameter is read.
 */
function unwrapResultUrl(href) {
  const raw = decodeEntities(String(href).trim());
  if (!raw) return '';

  const wrapped = /[?&]uddg=([^&]+)/.exec(raw);
  if (wrapped) {
    try {
      return decodeURIComponent(wrapped[1]);
    } catch {
      return raw;
    }
  }

  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

// ---------------------------------------------------------------------------
// read_page
// ---------------------------------------------------------------------------

async function read_page({ url, max_chars } = {}) {
  const target = String(url ?? '').trim();
  if (!target) throw new Error('read_page needs a url.');

  const limit = clamp(Number.parseInt(max_chars, 10) || 8000, 500, 20000);

  // The URL that was handed over is checked before the request, and where the request ended
  // up is checked after any redirects. See `fetchChecked` for what that does and does not
  // cover.
  const { response, url: finalUrl } = await fetchChecked(target);

  if (!response.ok) {
    throw new Error(`${finalUrl.hostname} returned ${response.status}.`);
  }

  const type = response.headers.get('content-type') ?? '';
  if (type && !/text\/(html|plain)|application\/(xhtml\+xml|json)/i.test(type)) {
    throw new Error(`${finalUrl.hostname} served ${type.split(';')[0]}, which has no readable text.`);
  }

  // Bounded by content-length when the server volunteers it. A multi-megabyte page would
  // otherwise be downloaded in full and then truncated.
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
    throw new Error(`${finalUrl.hostname} is ${Math.round(declared / 1024)} kB — too large to read.`);
  }

  const text = htmlToText(await response.text()).slice(0, limit);

  if (!text) throw new Error(`${finalUrl.hostname} had no readable text.`);

  return text;
}

/** 5 MB. Past this a page is not something to read, it is something to skip. */
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Resolver used only to answer "where does this name point".
 *
 * Over HTTPS so the answer cannot be forged on the way back — a plain UDP lookup could be
 * answered by whatever is on the path, and the whole guard trusts this answer. It also
 * means the hostname is visible to the resolver, which is a real cost of the design and
 * little worse than fetching the name.
 */
const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/** A resolver that hangs must not hold the tool loop open. */
const DNS_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/**
 * Fetches a page, refusing to read one that is not at a publicly routable address.
 *
 * Two checks, in two places, because a browser gives no way to make it one:
 *
 *   - **Before the request**, the URL that was handed over: https only, and a hostname that
 *     resolves to a public address. Nothing is sent to a private host the model named.
 *   - **After the request**, where it landed. Redirects are followed by the browser, and
 *     the landing URL gets the same two tests. A refused landing is cancelled before its
 *     body is read, and nothing from it reaches the model.
 *
 * **What this does not do, and why.** The guard used to fetch with `redirect: 'manual'` and
 * check every hop first. That cannot work here: a manual redirect comes back as an opaque
 * response with status 0 and no readable `Location`, so every redirect — `www`, a trailing
 * slash, a link shortener — failed as "returned 0". The cost of following instead is that a
 * public page which redirects to a private address still causes **one request to that
 * address** before it is refused. It is a GET with no cookies (`credentials: 'omit'`), and
 * nothing it returns is read or passed on, but it is sent. Chrome stops a redirect chain
 * itself, so there is no hop counter here.
 *
 * @returns {Promise<{response: Response, url: URL}>} the final response and the URL that
 * produced it, so an error names the host that actually answered.
 */
async function fetchChecked(rawUrl) {
  const target = parseTarget(rawUrl);
  await assertPublicHost(target);

  const response = await fetch(target.href, {
    headers: { 'Accept': 'text/html,text/plain;q=0.9' },
    redirect: 'follow',
    // No cookies for a host the model picked. The default would send them.
    credentials: 'omit',
  });

  if (!response.redirected) return { response, url: target };

  return { response, url: await checkLanding(target, response) };
}

/**
 * Applies the pre-request tests to where a redirected request ended up.
 *
 * @returns {Promise<URL>} the landing URL, once it has passed.
 * @throws {Error} naming both hosts, with the response's body left unread.
 */
async function checkLanding(origin, response) {
  try {
    const landed = parseTarget(response.url);
    await assertPublicHost(landed);
    return landed;
  } catch (err) {
    // The headers have arrived and the body has not been touched. It never will be.
    await response.body?.cancel().catch(() => {});

    let landedHost = response.url;
    try {
      landedHost = new URL(response.url).hostname;
    } catch {
      // Keep the raw text; an unparseable landing is itself the reason it was refused.
    }
    throw new Error(
      `${origin.hostname} redirected to ${landedHost}, which was not read. ${err.message}`,
    );
  }
}

/** Parses and scheme-checks a URL. https only, whatever the model asked for. */
function parseTarget(raw) {
  let parsed;

  try {
    parsed = new URL(String(raw).trim());
  } catch {
    throw new Error(`${raw} is not a URL.`);
  }

  // A tool that fetches whatever it is given must not also be a way to reach schemes the
  // extension has no business touching.
  if (parsed.protocol !== 'https:') {
    throw new Error(`Only https URLs can be read — got ${parsed.protocol}//`);
  }

  return parsed;
}

/**
 * Refuses a host that does not resolve to a publicly routable address.
 *
 * The check is on the **resolved address**, not on the text of the hostname. A name can
 * point at `127.0.0.1`, and refusing the string `localhost` does nothing about it — which
 * is why the name is only a cheap pre-filter and the address is what decides.
 */
async function assertPublicHost(target) {
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (isIpLiteral(host)) {
    const why = privateReason(host);
    if (why) throw new Error(`Refusing to read ${host} — it is ${why}.`);
    return;
  }

  // Cheap, and catches the intranet names that have no public address to check anyway.
  const name = localNameReason(host);
  if (name) throw new Error(`Refusing to read ${host} — it is ${name}.`);

  let addresses;
  try {
    addresses = await resolveAll(host);
  } catch (err) {
    // Fail closed. A guard that opens when the resolver is unavailable is not a guard, and
    // the failure reaches the model as a tool result rather than being swallowed.
    throw new Error(`Could not check where ${host} points, so it was not read (${err.message}).`);
  }

  // Every address, not the first. A hostile resolver can return one public address and one
  // private one, and only the private one is interesting.
  for (const address of addresses) {
    const why = privateReason(address);
    if (why) throw new Error(`${host} resolves to ${address}, which is ${why}. It was not read.`);
  }
}

/** Every A and AAAA record for a name. Throws when there is nothing to read. */
async function resolveAll(host) {
  const [v4, v6] = await Promise.all([dnsQuery(host, 'A', 1), dnsQuery(host, 'AAAA', 28)]);

  const addresses = [...v4, ...v6];
  if (!addresses.length) throw new Error('it has no address');

  return addresses;
}

async function dnsQuery(host, recordType, typeNumber) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);

  try {
    const response = await fetch(`${DNS_ENDPOINT}?name=${encodeURIComponent(host)}&type=${recordType}`, {
      headers: { 'Accept': 'application/dns-json' },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error('the resolver returned an error');

    const body = await response.json();
    return (body.Answer ?? [])
      .filter((answer) => answer.type === typeNumber && typeof answer.data === 'string')
      .map((answer) => answer.data.toLowerCase());
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'the resolver timed out' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

/** Names that are local by definition and have no public address to check. */
function localNameReason(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) return 'a loopback name';
  if (host.endsWith('.local')) return 'an mDNS name';
  if (host.endsWith('.internal') || host.endsWith('.home.arpa')) return 'an intranet name';
  // A single label has no public meaning — only a local resolver can answer it.
  if (!host.includes('.')) return 'a bare hostname';
  return null;
}

function isIpLiteral(host) {
  return host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

/**
 * Why an address is not publicly routable, or null if it is.
 *
 * The IPv4 list is explicit because each entry is a place real data lives — 169.254.0.0/16
 * above all, which is where cloud metadata sits and which is the single most valuable
 * thing on a machine to be able to read. The IPv6 side needs no list: `2000::/3` is the
 * only globally routable range, so unique-local, link-local, multicast, and the
 * unspecified address all fall out of one comparison.
 */
function privateReason(address) {
  const host = String(address).trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (host.includes(':')) {
    const groups = parseIpv6(host);
    if (!groups) return 'not a valid address';

    // ::ffff:127.0.0.1 is a loopback address in IPv6 costume, and it is the form a bypass
    // actually takes. Named so the refusal says why rather than just "not routable".
    const mapped = ipv4MappedAddress(groups);
    if (mapped) return privateReason(mapped);

    return inPrefix(groups, GLOBAL_IPV6) ? null : 'not a globally routable IPv6 address';
  }

  const number = ipv4ToNumber(host);
  if (number === null) return 'not a valid address';

  for (const block of IPV4_BLOCKS) {
    if (number >= block.start && number <= block.end) return block.label;
  }

  return null;
}

// Written as eight full groups: `parseIpv6` parses whole addresses, and `2000` on its own
// is not one.
const GLOBAL_IPV6 = ['2000:0:0:0:0:0:0:0', 3];

const IPV4_BLOCKS = [
  ['0.0.0.0', 8, 'this network'],
  ['10.0.0.0', 8, 'a private address'],
  ['100.64.0.0', 10, 'carrier-grade NAT'],
  ['127.0.0.0', 8, 'a loopback address'],
  ['169.254.0.0', 16, 'a link-local address — this is where cloud metadata lives'],
  ['172.16.0.0', 12, 'a private address'],
  ['192.0.0.0', 24, 'reserved'],
  ['192.0.2.0', 24, 'reserved'],
  ['192.88.99.0', 24, 'reserved'],
  ['192.168.0.0', 16, 'a private address'],
  ['198.18.0.0', 15, 'reserved'],
  ['198.51.100.0', 24, 'reserved'],
  ['203.0.113.0', 24, 'reserved'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
].map(([prefix, bits, label]) => {
  const start = ipv4ToNumber(prefix);
  return { start, end: start + 2 ** (32 - bits) - 1, label };
});

/** An IPv4 address as a number, or null if the text is not one. */
function ipv4ToNumber(text) {
  const octets = text.split('.');
  if (octets.length !== 4) return null;

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    value = value * 256 + Number(octet);
  }

  return value;
}

/** The IPv4 an IPv4-mapped IPv6 address carries, or null if it is not that form. */
function ipv4MappedAddress(groups) {
  // ::ffff:a.b.c.d expands to five zero groups, ffff, then the two halves of the address.
  if (groups.slice(0, 5).some((g) => g !== 0) || groups[5] !== 0xffff) return null;

  const [a, b] = [groups[6] >> 8, groups[6] & 0xff];
  const [c, d] = [groups[7] >> 8, groups[7] & 0xff];
  return `${a}.${b}.${c}.${d}`;
}

/** Whether the leading `bits` bits of `groups` match `prefix`. */
function inPrefix(groups, [head, bits]) {
  const prefix = parseIpv6(head);
  if (!prefix) return false;

  for (let i = 0; i < 8; i += 1) {
    const remaining = bits - i * 16;
    if (remaining <= 0) break;

    const mask = remaining >= 16 ? 0xffff : (0xffff << (16 - remaining)) & 0xffff;
    if ((groups[i] & mask) !== (prefix[i] & mask)) return false;
  }

  return true;
}

/**
 * Expands an IPv6 literal to eight 16-bit groups.
 *
 * Handles `::` compression and a trailing dotted quad — which is how an IPv4-mapped address
 * is normally written, `::ffff:127.0.0.1` — so the form that matters most to this guard is
 * not the one that would otherwise be dropped as malformed.
 *
 * @returns {number[]|null} the groups, or null if the text is not an address.
 */
function parseIpv6(text) {
  let value = text.trim().toLowerCase();

  const embedded = /(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (embedded) {
    const number = ipv4ToNumber(embedded[1]);
    if (number === null) return null;
    value = `${value.slice(0, embedded.index)}${(number >>> 16).toString(16)}:${(number & 0xffff).toString(16)}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];

  const groups = [];
  for (const part of head.concat(tail)) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(Number.parseInt(part, 16));
  }

  // Only an explicit `::` can stand for missing groups, and it stands for at least one.
  if (halves.length === 2) {
    if (head.length + tail.length > 7) return null;
    groups.splice(head.length, 0, ...Array(8 - head.length - tail.length).fill(0));
  }

  return groups.length === 8 ? groups : null;
}

// ---------------------------------------------------------------------------
// HTML to text
// ---------------------------------------------------------------------------

/**
 * Reduces a page to readable text.
 *
 * Elements whose *content* is not prose are removed whole rather than untagged — stripping
 * the tags off a `<script>` leaves its source code sitting in the middle of the answer.
 */
export function htmlToText(html) {
  const cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    // An opening tag of the same set with no closing partner — a truncated or malformed
    // document. Everything to the end of input goes with it: that tail is either the
    // element's source or nothing worth reading, and untagging it would leak script text
    // into an answer.
    .replace(/<(script|style|noscript|svg|canvas|template)\b[^>]*>[\s\S]*$/i, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)\s*>/gi, '\n');

  const text = decodeEntities(stripTags(cleaned))
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/** Collapses all whitespace to single spaces — for values that must stay on one line. */
function oneLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ');
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/**
 * Decodes HTML entities in a single pass.
 *
 * One pass matters: decoding `&amp;lt;` twice turns it into `<`, which would re-introduce
 * markup that the tag stripper has already finished with.
 */
export function decodeEntities(html) {
  return String(html).replace(/&(#x[0-9a-f]+|#?[0-9]+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);

      // `String.fromCodePoint` throws outside the Unicode range, and a malformed entity in
      // someone's web page should not become an exception here.
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }

    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}