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
    throw new Error(`Search failed: DuckDuckGo returned ${response.status}.`);
  }

  const html = await response.text();
  const results = parseSearchResults(html).slice(0, limit);

  if (!results.length) {
    // A distinct message matters: "no results" and "the parser broke" look identical from
    // outside, and only one of them is the model's fault to work around.
    throw new Error(
      `No results for "${q}". The search backend may be rate-limiting, or its page ` +
        'structure may have changed.',
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

  const parsed = new URL(target);

  // https only, whatever the model asked for. A tool that will fetch whatever it is given
  // must not also be a way to reach schemes the extension has no business touching.
  if (parsed.protocol !== 'https:') {
    throw new Error(`Only https URLs can be read — got ${parsed.protocol}//`);
  }

  if (isLocalHost(parsed.hostname)) {
    throw new Error(`Refusing to read ${parsed.hostname} — it is a local address.`);
  }

  const limit = clamp(Number.parseInt(max_chars, 10) || 8000, 500, 20000);

  const response = await fetch(parsed.href, {
    headers: { 'Accept': 'text/html,text/plain;q=0.9' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`${parsed.hostname} returned ${response.status}.`);
  }

  const type = response.headers.get('content-type') ?? '';
  if (type && !/text\/(html|plain)|application\/(xhtml\+xml|json)/i.test(type)) {
    throw new Error(`${parsed.hostname} served ${type.split(';')[0]}, which has no readable text.`);
  }

  // Bounded by content-length when the server volunteers it. A multi-megabyte page would
  // otherwise be downloaded in full and then truncated.
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
    throw new Error(`${parsed.hostname} is ${Math.round(declared / 1024)} kB — too large to read.`);
  }

  const text = htmlToText(await response.text()).slice(0, limit);

  if (!text) throw new Error(`${parsed.hostname} had no readable text.`);

  return text;
}

/** 5 MB. Past this a page is not something to read, it is something to skip. */
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Blocks the obvious local addresses.
 *
 * The manifest only grants the `https` scheme, so most of this is unreachable, but a tool
 * that fetches a model-supplied URL is exactly the shape where a "fetch anything the
 * agent asks for" rule turns into reaching a machine on the user's own network. Cheap to
 * refuse.
 */
function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
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