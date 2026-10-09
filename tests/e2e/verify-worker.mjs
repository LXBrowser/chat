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
// B. The stream: tool calls, provider errors, the last frame
// ===========================================================================
//
// Each scenario opens a fresh chat, so what it reads back is its own. The bodies are written
// by hand with `routeRaw` because a well-behaved provider's stream — which is all
// `routeOpenRouter` can produce — never repeats a tool-call id, carries an error, or stops
// without a newline.

console.log('\n--- B. the stream: tool calls, provider errors, the last frame ---');

const newChat = async () => {
  await page.click('[data-action="new-chat"]');
  await page.waitForTimeout(400);
  return page.evaluate(async () => (await import('./lib/sessions.js')).current());
};
const titleNow = () => page.locator('#chat-title').inputValue();
const statusNow = () => page.locator('#send-status').textContent();
const assistantTurns = (id) =>
  page.evaluate(async (sessionId) => {
    const db = await import('../db.js');
    return (await db.listMessages(sessionId)).filter((m) => m.role === 'assistant').map((m) => m.content.trim());
  }, id);

const titleCall = (title) => ({ index: 0, id: 'call_t', function: { name: 'update_chat_title', arguments: JSON.stringify({ title }) } });
const toolFrame = (fragment) => frame({ choices: [{ delta: { tool_calls: [fragment] } }] });
const errorFrame = frame({
  error: { code: 'server_error', message: 'Provider disconnected' },
  choices: [{ delta: { content: '' }, finish_reason: 'error' }],
});

// --- B1. The tool call echoed back is the shape the API defines ----------------

await newChat();
let stream = await stubRounds([
  { body: toolFrame(titleCall('Index check')) + DONE },
  { body: say('done') + DONE },
]);
await send('echo check');

const echoed = stream.requests[1]?.messages?.find((m) => m.role === 'assistant')?.tool_calls ?? [];
t.ok('the tool call is echoed back without the streaming index',
  echoed.length === 1 && !('index' in echoed[0]), JSON.stringify(echoed));
t.ok('...and keeps exactly id, type and function',
  echoed.length === 1 && Object.keys(echoed[0]).sort().join() === 'function,id,type', JSON.stringify(Object.keys(echoed[0] ?? {})));
t.ok('...and the tool still ran', (await titleNow()) === 'Index check', `title: "${await titleNow()}"`);

// --- B2. A provider that repeats the id and the name on every chunk -----------

await newChat();
const header = { index: 0, id: 'call_rep', name: 'update_chat_title' };
stream = await stubRounds([
  {
    body:
      toolFrame({ index: 0, id: header.id, function: { name: header.name, arguments: '' } }) +
      toolFrame({ index: 0, id: header.id, function: { name: header.name, arguments: '{"title":"Rep' } }) +
      toolFrame({ index: 0, id: header.id, function: { name: header.name, arguments: 'eated"}' } }) +
      DONE,
  },
  { body: say('done') + DONE },
]);
await send('repeat check');

const repeated = stream.requests[1]?.messages?.find((m) => m.role === 'assistant')?.tool_calls?.[0];
t.ok('a repeated id is kept as one id', repeated?.id === 'call_rep', JSON.stringify(repeated?.id));
t.ok('a repeated name is kept as one name', repeated?.function?.name === 'update_chat_title', JSON.stringify(repeated?.function?.name));
t.ok('...so the tool runs', (await titleNow()) === 'Repeated', `title: "${await titleNow()}"`);

// Control: a name legitimately split across chunks, with the id sent once, must still join.
await newChat();
stream = await stubRounds([
  {
    body:
      toolFrame({ index: 0, id: 'call_split', function: { name: 'update_chat', arguments: '' } }) +
      toolFrame({ index: 0, function: { name: '_title', arguments: '{"title":"Split name"}' } }) +
      DONE,
  },
  { body: say('done') + DONE },
]);
await send('split check');
t.ok('a name split across chunks is still joined (control)', (await titleNow()) === 'Split name', `title: "${await titleNow()}"`);

// --- B3. A provider error in the middle of the stream --------------------------

const chatNoText = await newChat();
stream = await stubRounds([{ body: errorFrame + DONE }]);
await send('error with nothing before it');
const statusPlain = await statusNow();
t.ok('the provider\'s own reason is shown', /Provider disconnected/.test(statusPlain), `status: "${statusPlain}"`);
t.ok('...and is not retried', stream.requests.length === 1, `${stream.requests.length} request(s)`);
t.ok('...and nothing is stored as an answer', (await assistantTurns(chatNoText)).length === 0,
  JSON.stringify(await assistantTurns(chatNoText)));

const chatPartial = await newChat();
stream = await stubRounds([{ body: say('Half an ans') + errorFrame + DONE }]);
await send('error after some text');
const statusPartial = await statusNow();
t.ok('the reason is shown when text had already arrived', /Provider disconnected/.test(statusPartial), `status: "${statusPartial}"`);
t.ok('a cut-off answer is not stored as if it were complete', (await assistantTurns(chatPartial)).length === 0,
  JSON.stringify(await assistantTurns(chatPartial)));

// --- B4. The last frame has no newline after it --------------------------------

const chatTail = await newChat();
stream = await stubRounds([{ body: say('The ') + say('end').trimEnd() }]);
await send('no trailing newline');
t.ok('the final frame is read even with no newline after it',
  (await assistantTurns(chatTail)).join('|') === 'The end', JSON.stringify(await assistantTurns(chatTail)));

// The two provider-error sends log a console error by design; anything else is a fault.
const unexpected = errors.filter((e) => !e.includes('Send failed'));
t.ok('no page error besides the deliberate failed sends', unexpected.length === 0, unexpected.join(' | ') || 'none');

// ===========================================================================
// C. The tool-round limit
// ===========================================================================
//
// The model keeps asking to search, and the search backend keeps failing — DuckDuckGo
// answering an extension with a bot challenge rather than results. A model told to search
// before it answers will retry, and six rounds go quickly. The loop's last request is meant
// to be the model's chance to answer with what it has; here it is held to that.

console.log('\n--- C. the tool-round limit ---');

let searches = 0;
await context.route('https://html.duckduckgo.com/**', (route) => {
  searches += 1;
  return route.fulfill({
    status: 202,
    contentType: 'text/html',
    body: '<html><body><p>Unfortunately, bots use DuckDuckGo too.</p></body></html>',
  });
});

const askForSearch = (index) => ({ body: call(`call_s${index}`, 'search_web', { query: 'latest version of x' }) + DONE });

// --- C1. A model that obeys `tool_choice: "none"` on the last request ----------

const chatLoop = await newChat();
let loop = await stubRounds((request, index) =>
  request.tool_choice === 'none'
    ? { body: say('Search is failing, so from what I know: it is fine.') + DONE }
    : askForSearch(index));
await send('what is the latest version of x?');

const loopStatus = await statusNow();
t.ok('the send succeeds instead of ending in an error', loopStatus === '', `status: "${loopStatus}"`);
t.ok('...and the model\'s answer is what is stored',
  (await assistantTurns(chatLoop)).join('|') === 'Search is failing, so from what I know: it is fine.',
  JSON.stringify(await assistantTurns(chatLoop)));
t.ok('seven requests were made: six tool rounds and one last chance', loop.requests.length === 7,
  `${loop.requests.length} requests`);
t.ok('only the last request forbids tools; every one of them still declares them',
  loop.requests.every((r) => r.tools?.length > 0) &&
    loop.requests.slice(0, 6).every((r) => !('tool_choice' in r)) &&
    loop.requests[6]?.tool_choice === 'none',
  JSON.stringify(loop.requests.map((r) => r.tool_choice ?? '-')));
t.ok('the search really was attempted six times', searches === 6, `${searches} searches`);

const lastSearchResult = loop.requests[6]?.messages?.filter((m) => m.role === 'tool').pop()?.content ?? '';
t.ok('a failed search tells the model to stop searching and answer',
  /stop searching/i.test(lastSearchResult) && /already know/i.test(lastSearchResult), JSON.stringify(lastSearchResult));

// --- C2. A model that ignores it and asks for tools anyway ---------------------
//
// Nothing the extension sends can make a model obey. What it can do is fail with a message
// that says what happened, instead of one that only says it stopped.

await newChat();
loop = await stubRounds((request, index) => askForSearch(index));
await send('and again?');
const ignoredStatus = await statusNow();
t.ok('a model that still asks for tools ends in the named backstop',
  /^Stopped after 6 rounds of tool calls without an answer \(search_web ×6\)\.$/.test(ignoredStatus),
  `status: "${ignoredStatus}"`);
t.ok('...after seven requests, not more', loop.requests.length === 7, `${loop.requests.length} requests`);

const unexpectedC = errors.filter((e) => !e.includes('Send failed'));
t.ok('no page error besides the deliberate failed send', unexpectedC.length === 0, unexpectedC.join(' | ') || 'none');

// ===========================================================================
// D. A model that cannot use tools
// ===========================================================================
//
// OpenRouter refuses any request that carries `tools` to a model with no tool support — a
// 404 before anything is generated, so nothing is billed. The extension always declares tools,
// so every send to such a model used to fail with the provider's text. The custom model field
// exists to type exactly this kind of id, and 68 of the 458 models in the catalogue on
// 2026-10-09 list no `tools` among their supported parameters.

console.log('\n--- D. a model that cannot use tools ---');

const refuseTools = {
  status: 404,
  json: {
    error: {
      message: 'No endpoints found that support tool use. To learn more about provider routing, visit: https://openrouter.ai/docs/provider-routing',
      code: 404,
    },
  },
};

/** Records every state the status row passes through during one send. */
async function watchStatusRow() {
  await page.evaluate(() => {
    window.__rows = [];
    const row = document.getElementById('activity-text');
    window.__rowObserver?.disconnect();
    window.__rowObserver = new MutationObserver(() => window.__rows.push(row.textContent));
    window.__rowObserver.observe(row, { childList: true, characterData: true, subtree: true });
  });
}
const rowStates = () => page.evaluate(() => [...new Set(window.__rows)]);

// --- D1. The model refuses tools, then answers without them -------------------

const chatNoTools = await newChat();
let refusing = await stubRounds((request) =>
  request.tools ? refuseTools : { body: say('Answered without tools.') + DONE });
await watchStatusRow();
await send('hello, no tools please');

t.ok('the send succeeds', (await statusNow()) === '', `status: "${await statusNow()}"`);
t.ok('...with the answer from the tool-less request',
  (await assistantTurns(chatNoTools)).join('|') === 'Answered without tools.', JSON.stringify(await assistantTurns(chatNoTools)));
t.ok('two requests: one with tools, refused, then the same without them',
  refusing.requests.length === 2 && Boolean(refusing.requests[0]?.tools) && !('tools' in (refusing.requests[1] ?? {})),
  `${refusing.requests.length} requests; tools sent: ${JSON.stringify(refusing.requests.map((r) => Boolean(r?.tools)))}`);
t.ok('the retry carries no tool_choice either', refusing.requests[1] && !('tool_choice' in refusing.requests[1]));

const states = await rowStates();
t.ok('the status row said the model has no tool support', states.some((s) => /no tool support/i.test(s)),
  JSON.stringify(states));

const first = refusing.requests[0]?.messages?.[0];
const second = refusing.requests[1]?.messages?.[0];
t.ok('the retry tells the model it cannot call tools; the first request did not',
  second?.role === 'system' && /cannot call tools/i.test(second.content) && !/cannot call tools/i.test(first?.content ?? ''),
  JSON.stringify(second?.content?.slice(-120)));

// --- D2. Errors that are not about tools are left alone ------------------------

const refusals = [
  ['a 404 about a missing model', { status: 404, json: { error: { message: 'No endpoints found for acme/ghost-model.', code: 404 } } }, /No endpoints found for acme\/ghost-model/],
  ['a 401', { status: 401, json: { error: { message: 'No auth credentials found', code: 401 } } }, /401/],
  ['a 400 about a tool schema', { status: 400, json: { error: { message: "Invalid schema for function 'search_web': 'minimum' is not permitted.", code: 400 } } }, /Invalid schema/],
];
for (const [label, entry, shown] of refusals) {
  const chatOther = await newChat();
  refusing = await stubRounds(() => entry);
  await send('this should not be retried');
  const shownStatus = await statusNow();
  t.ok(`${label} is shown and not retried (control)`,
    refusing.requests.length === 1 && shown.test(shownStatus) && (await assistantTurns(chatOther)).length === 0,
    `${refusing.requests.length} request(s); status: "${shownStatus}"`);
}

const unexpectedD = errors.filter((e) => !e.includes('Send failed'));
t.ok('no page error besides the deliberate failed sends', unexpectedD.length === 0, unexpectedD.join(' | ') || 'none');

// ===========================================================================
// E. An answer that came back empty says why
// ===========================================================================
//
// "The model returned an empty answer." is true and tells you nothing. A reasoning model — one
// of the two presets is — can spend its whole output budget thinking and stop with no answer at
// all, which looks identical to a model that said nothing. How it stopped, and whether any
// reasoning arrived, is the difference, and the worker is the only place that sees it.

console.log('\n--- E. an answer that came back empty ---');

const reasoning = (text) => frame({ choices: [{ delta: { reasoning: text } }] });
const stopsWith = (reason) => frame({ choices: [{ delta: {}, finish_reason: reason }] });

// --- E1. Reasoning only, cut off by the output limit ---------------------------

const chatThinking = await newChat();
let empties = await stubRounds([
  { body: reasoning('Let me think about this. ') + reasoning('Still thinking.') + stopsWith('length') + DONE },
]);
await send('think hard');
const thinking = await statusNow();
t.ok('it says how the model stopped', /stopped with "length"/.test(thinking), `status: "${thinking}"`);
t.ok('...and that reasoning arrived without an answer', /40 characters of reasoning arrived but no answer/.test(thinking),
  `status: "${thinking}"`);
t.ok('...and it is not retried or stored', empties.requests.length === 1 && (await assistantTurns(chatThinking)).length === 0,
  `${empties.requests.length} request(s); stored: ${JSON.stringify(await assistantTurns(chatThinking))}`);

// --- E2. No reasoning, a plain stop --------------------------------------------

await newChat();
empties = await stubRounds([{ body: stopsWith('stop') + DONE }]);
await send('say nothing');
const quiet = await statusNow();
t.ok('a model that simply stopped says so', /^The model returned an empty answer \(it stopped with "stop"\)\.$/.test(quiet),
  `status: "${quiet}"`);

// --- E3. Only what is known is said (control) ----------------------------------

await newChat();
empties = await stubRounds([{ body: DONE }]);
await send('a stream with nothing in it');
const nothing = await statusNow();
t.ok('with nothing known the sentence is the plain one (control)', nothing === 'The model returned an empty answer.',
  `status: "${nothing}"`);

// --- E4. An ordinary answer is untouched (control) -----------------------------

const chatFine = await newChat();
empties = await stubRounds([{ body: say('A normal answer.') + stopsWith('stop') + DONE }]);
await send('an ordinary question');
t.ok('a normal answer is still stored with no status (control)',
  (await statusNow()) === '' && (await assistantTurns(chatFine)).join('|') === 'A normal answer.',
  `status: "${await statusNow()}"; stored: ${JSON.stringify(await assistantTurns(chatFine))}`);

const unexpectedE = errors.filter((e) => !e.includes('Send failed'));
t.ok('no page error besides the deliberate failed sends', unexpectedE.length === 0, unexpectedE.join(' | ') || 'none');

// ===========================================================================
await context.unroute(OPENROUTER);

const allPassed = t.report();
console.log(allPassed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
await close();
process.exit(allPassed ? 0 : 1);
