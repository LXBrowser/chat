/**
 * verify-worker.mjs — what the service worker does with the network, end to end.
 *
 * Everything outside the extension is a stub: OpenRouter, the DNS-over-HTTPS resolver and
 * every site `read_page` is pointed at. Nothing here makes a billable call or touches a real
 * host, and the sites are `example.test` / `127.0.0.1`, which only exist in the stubs.
 *
 * Each check is written to fail on the tree before its fix. Run it against a pre-fix
 * worktree with `CHAT_EXT=<path> node verify-worker.mjs`.
 */

import {
  launch, pageUrl, routeDns, routeRaw, seedKey, startSite, watchErrors, close, checks,
  OPENROUTER, SITE_ARGS,
} from './harness.mjs';

const t = checks();

const { context, worker, extensionId } = await launch({ args: SITE_ARGS });
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
await page.goto(pageUrl(extensionId));
await page.waitForSelector('.history__item');

// --- SSE building blocks ------------------------------------------------------

const frame = (object) => `data: ${JSON.stringify(object)}\n\n`;
const say = (content) => frame({ choices: [{ delta: { content } }] });
const call = (id, name, args, index = 0) =>
  frame({
    choices: [{
      delta: { tool_calls: [{ index, id, function: { name, arguments: JSON.stringify(args) } }] },
    }],
  });
const DONE = 'data: [DONE]\n\n';

const settled = async () => {
  await page.waitForFunction(() => !document.getElementById('send-btn').disabled, null, { timeout: 20000 });
  await page.waitForTimeout(300);
};

/** Sends a prompt through the interface and waits until the send button is back. */
async function send(prompt) {
  await page.fill('#prompt', prompt);
  await page.click('#send-btn');
  await settled();
}

/** Replaces the OpenRouter stub. */
async function stubRounds(rounds) {
  await context.unroute(OPENROUTER);
  return routeRaw(context, rounds);
}

// ===========================================================================
// A. read_page and redirects
// ===========================================================================
//
// The model asks for a page, the worker fetches it, and what comes back is the `tool`
// message in the *second* request. That message is the observable: it is exactly what the
// model would have read.

console.log('\n--- A. read_page follows a redirect and checks where it lands ---');

// A real server, with real redirects: see SITE_ARGS in the harness for why a stubbed 302
// cannot stand in. `example.test` and `intranet.example.test` reach this machine through the
// browser's resolver rules; the DNS-over-HTTPS stub is what tells the extension they are
// public (93.184.216.34) or, for the intranet name, private (10.0.0.5).
await routeDns(context, { 'intranet.example.test': ['10.0.0.5'] });

const page_ = (res, body, extraHeaders = {}) => {
  res.writeHead(200, { 'content-type': 'text/html', ...extraHeaders });
  res.end(`<html><body><p>${body}</p></body></html>`);
};
const redirectTo = (res, to) => {
  res.writeHead(302, { location: to });
  res.end();
};

const site = await startSite(({ securePort, plainPort }) => (req, res) => {
  switch (req.url) {
    case '/direct': return page_(res, 'Hello from the direct page.');
    case '/old': return redirectTo(res, '/new');
    case '/new': return page_(res, 'Hello from the final page.');
    case '/to-www': return redirectTo(res, `https://www.example.test:${securePort}/landed`);
    case '/landed': return page_(res, 'Hello from the other public origin.');
    case '/to-loopback': return redirectTo(res, `https://127.0.0.1:${securePort}/secret`);
    case '/to-private-name': return redirectTo(res, `https://intranet.example.test:${securePort}/admin`);
    case '/to-http': return redirectTo(res, `http://example.test:${plainPort}/plain`);
    case '/secret': return page_(res, 'SECRET FROM LOOPBACK');
    case '/admin': return page_(res, 'SECRET FROM THE INTRANET');
    // The manifest grants https hosts only, so without this header Chrome blocks reading an
    // http response on CORS grounds and the extension's own scheme check is never reached —
    // which would let this test pass for a reason that is not the code under test. A server
    // that sends it is the case the scheme check exists for.
    case '/plain': return page_(res, 'SECRET OVER PLAIN HTTP', { 'access-control-allow-origin': '*' });
    default:
      res.writeHead(404);
      return res.end();
  }
});

/** What the model would read after asking for this path on the test site. */
async function readPage(path) {
  const stub = await stubRounds([
    { body: call('call_read', 'read_page', { url: site.url(path) }) + DONE },
    { body: say('done') + DONE },
  ]);
  await send(`please read ${path}`);

  const tool = stub.requests[1]?.messages?.find((m) => m.role === 'tool');
  return { content: tool?.content ?? '', requests: stub.requests.length };
}

const direct = await readPage('/direct');
t.ok('a direct URL is read (control)', direct.content === 'Hello from the direct page.', JSON.stringify(direct.content));

const viaRedirect = await readPage('/old');
t.ok('a redirect to a public page is read', viaRedirect.content === 'Hello from the final page.',
  JSON.stringify(viaRedirect.content));

// The commonest redirect on the web: a different origin, but a public one.
const toOtherOrigin = await readPage('/to-www');
t.ok('a redirect to another public origin is read', toOtherOrigin.content === 'Hello from the other public origin.',
  JSON.stringify(toOtherOrigin.content));

const toLoopback = await readPage('/to-loopback');
t.ok('a redirect to a loopback address is refused, naming why',
  /loopback/i.test(toLoopback.content) && !toLoopback.content.includes('SECRET'),
  JSON.stringify(toLoopback.content));
const toPrivateName = await readPage('/to-private-name');
t.ok('a redirect to a name that resolves to a private address is refused',
  /10\.0\.0\.5/.test(toPrivateName.content) && !toPrivateName.content.includes('SECRET'),
  JSON.stringify(toPrivateName.content));

const toHttp = await readPage('/to-http');
t.ok('a redirect down to http is refused on the scheme',
  /https/i.test(toHttp.content) && !toHttp.content.includes('SECRET'), JSON.stringify(toHttp.content));

// The cost of following redirects, stated as a check instead of left implicit: the browser
// makes the request before the landing address can be examined, so each refused landing was
// still sent exactly one request. Nothing it returned was read — the SECRET assertions above
// are the proof of that half.
const sent = (host) => site.hits.filter((h) => h.startsWith(host)).length;
t.ok('each refused landing was sent exactly one request, and its answer was never read',
  sent('127.0.0.1/secret') === 1 && sent('intranet.example.test/admin') === 1 && sent('example.test/plain') === 1,
  `loopback ${sent('127.0.0.1/secret')}, private name ${sent('intranet.example.test/admin')}, http ${sent('example.test/plain')}`);

const results = [direct, viaRedirect, toOtherOrigin, toLoopback, toPrivateName, toHttp];
t.ok('every conversation made its two requests', results.every((r) => r.requests === 2),
  results.map((r) => r.requests).join(','));

t.ok('no page error', errors.length === 0, errors.join(' | ') || 'none');

await site.stop();

// ===========================================================================
await context.unroute(OPENROUTER);

const allPassed = t.report();
console.log(allPassed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
await close();
process.exit(allPassed ? 0 : 1);
