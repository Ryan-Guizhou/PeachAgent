/* Execute the actual router and auth adapter against a small DOM/history model.
 * This checks state transitions and DOM identity, not browser layout or native scrolling.
 */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto').webcrypto;
const root = path.resolve(__dirname, '..');
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };
const equal = (value, expected, message) => { assert.equal(value, expected, message); assertions++; };

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(listener => listener !== fn)); }
  emit(name, event = {}) { return Promise.all((this.listeners.get(name) || []).map(listener => listener(event))); }
}

function environment(options = {}) {
  const local = options.local || new Map();
  const session = options.session || new Map();
  const clock = { now: options.now || Date.now() };
  const pendingEvents = [];
  const scheduled = new Map();
  let nextTimer = 1;
  let document;

  class Element extends Events {
    constructor(tag = 'div', attrs = {}) {
      super();
      this.tagName = tag.toUpperCase(); this.attributes = {}; this.dataset = {}; this.children = [];
      this.parentElement = null; this.style = {}; this.scrollTop = 0; this.scrollLeft = 0;
      this.hidden = false; this.open = false; this.disabled = false; this.isConnected = true;
      this.innerHTMLWrites = 0; this._html = ''; this._text = ''; this.classNames = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => this.classNames.add(name)),
        remove: (...names) => names.forEach(name => this.classNames.delete(name)),
        contains: name => this.classNames.has(name),
        toggle: (name, enabled) => { const include = enabled === undefined ? !this.classNames.has(name) : enabled; include ? this.classNames.add(name) : this.classNames.delete(name); return include; }
      };
      Object.entries(attrs).forEach(([key, value]) => this.setAttribute(key, value));
    }
    get className() { return [...this.classNames].join(' '); }
    set className(value) { this.classNames = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get id() { return this.attributes.id || ''; }
    set id(value) { this.setAttribute('id', value); }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this.innerHTMLWrites++;
      this.children.forEach(child => child.disconnect());
      this.children = []; this._text = ''; this._html = String(value);
      const stack = [this];
      const voids = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);
      for (const token of String(value).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('<!--')) continue;
        if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
        if (token.startsWith('<')) {
          const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
          const attrs = {};
          const tail = token.slice(tag.length + 1).replace(/\/?\s*>$/, '');
          for (const match of tail.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
          const child = new Element(tag, attrs); stack[stack.length - 1].append(child);
          if (!voids.has(tag.toLowerCase()) && !/\/\s*>$/.test(token)) stack.push(child);
        } else stack[stack.length - 1]._text += token;
      }
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children.forEach(child => child.disconnect()); this.children = []; this._text = String(value); this._html = String(value); }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = value;
      if (name === 'hidden') this.hidden = true;
      if (name === 'disabled') this.disabled = true;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_all, char) => char.toUpperCase())] = String(value);
    }
    getAttribute(name) { return name === 'class' ? this.className : this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'hidden') this.hidden = false; if (name === 'disabled') this.disabled = false; }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const descendant = selector.lastIndexOf(' ');
      if (descendant >= 0) return this.matches(selector.slice(descendant + 1)) && !!this.parentElement?.closest(selector.slice(0, descendant));
      const attrs = [...selector.matchAll(/\[([\w-]+)(?:([\^]?=)["']?([^\]"']*)["']?)?\]/g)];
      const base = selector.replace(/\[[^\]]+\]/g, '');
      const tag = base.match(/^[a-zA-Z][\w-]*/)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const id = base.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
      for (const match of base.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
      for (const [, name, operator, value] of attrs) {
        const actual = this.getAttribute(name);
        if (actual === null) return false;
        if (operator === '=' && actual !== value) return false;
        if (operator === '^=' && !actual.startsWith(value)) return false;
      }
      return true;
    }
    querySelectorAll(selector) {
      const result = [];
      const visit = parent => parent.children.forEach(child => { if (child.matches(selector)) result.push(child); visit(child); });
      visit(this); return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
    append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.children.push(node); }); }
    appendChild(node) { this.append(node); return node; }
    disconnect() { this.isConnected = false; this.children.forEach(child => child.disconnect()); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.disconnect(); }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    scrollIntoView() {}
  }

  document = new Events();
  document.body = new Element('body'); document.title = ''; document.activeElement = null;
  document.createElement = tag => new Element(tag);
  document.getElementById = id => document.body.id === id ? document.body : document.body.querySelector('#' + id);
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  for (const [tag, id] of [['aside', 'sidebar'], ['header', 'topbar'], ['main', 'page-content'], ['dialog', 'app-dialog'], ['div', 'toast-stack'], ['div', 'storage-notice']]) document.body.append(new Element(tag, { id }));

  const window = new Events();
  window.crypto = crypto; window.scrollX = 0; window.scrollY = 0; window.scrollCalls = [];
  window.scrollTo = position => { window.scrollX = position.left ?? window.scrollX; window.scrollY = position.top ?? window.scrollY; window.scrollCalls.push({ ...position }); };
  let hash = options.hash || '#home';
  const entries = [{ hash, state: null }]; let index = 0;
  const stats = { push: 0, replace: 0, reload: 0, render: new Map(), cleanup: 0 };
  const normalize = value => String(value).startsWith('#') ? String(value) : '#' + String(value);
  const location = {
    get hash() { return hash; },
    set hash(value) { const next = normalize(value); if (next === hash) return; hash = next; entries.splice(index + 1); entries.push({ hash, state: null }); index++; pendingEvents.push('hashchange'); },
    reload() { stats.reload++; }
  };
  const history = {
    scrollRestoration: 'auto',
    pushState(state, _title, value) { hash = normalize(value); entries.splice(index + 1); entries.push({ hash, state }); index++; stats.push++; },
    replaceState(state, _title, value) { hash = normalize(value); entries[index] = { hash, state }; stats.replace++; },
    async move(delta) {
      const next = index + delta; if (next < 0 || next >= entries.length) return;
      const previous = hash; index = next; hash = entries[index].hash;
      await window.emit('popstate', { state: entries[index].state });
      if (hash !== previous) await window.emit('hashchange', {});
    },
    back() { return this.move(-1); }, forward() { return this.move(1); },
    get length() { return entries.length; }, get index() { return index; }
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  const setTimer = (fn, delay) => { const id = nextTimer++; scheduled.set(id, { fn, delay }); return id; };
  const context = {
    window, document, location, history, localStorage: storage(local), sessionStorage: storage(session),
    console, URL, URLSearchParams, Blob, TextEncoder, TextDecoder, Date: Clock, Uint8Array, Uint32Array, FormData,
    setTimeout: setTimer, setInterval: setTimer, clearTimeout: id => scheduled.delete(id), clearInterval: id => scheduled.delete(id),
    queueMicrotask, CSS: { escape: value => value }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'auth.js'), 'utf8'), context, { filename: 'auth.js' });
  const A = window.StudioAuth;
  const env = { A, context, window, document, location, history, stats, local, session, scheduled, Element, clock };
  env.loadCore = () => {
    vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, { filename: 'core.js' });
    const S = window.Studio;
    for (const route of ['home', 'agents', 'agent', 'workflows', 'workflow', 'planning', 'plan', 'services', 'service', 'models', 'model-detail', 'knowledge', 'capabilities', 'library', 'market', 'tasks', 'task', 'usage', 'quality', 'review', 'settings']) {
      S.page(route, { title: route + ' 页面', render() { stats.render.set(route, (stats.render.get(route) || 0) + 1); return `<section><h1>${route}</h1><p>页面内容</p></section>`; }, mount() { return () => { stats.cleanup++; }; } });
    }
    A.attach(S); env.S = S; S.init(); return S;
  };
  env.click = async target => { const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; await document.emit('click', event); return event; };
  env.flushHash = async () => { while (pendingEvents.length) await window.emit(pendingEvents.shift(), {}); };
  env.scroll = (top, left = 0) => { window.scrollY = top; window.scrollX = left; };
  return env;
}

(async () => {
  const app = environment();
  app.A.enterDemo({ navigate: false });
  const S = app.loadCore();
  const { document: doc, window: win, history, stats } = app;
  const sidebar = doc.getElementById('sidebar');
  const topbar = doc.getElementById('topbar');
  const nav = sidebar.querySelector('.nav-scroll');
  const modelLink = sidebar.querySelector('[data-nav="models"]');
  const qualityLink = sidebar.querySelector('[data-nav="quality"]');
  check(nav && modelLink && qualityLink, 'the DOM model parsed real navigation markup');
  equal(history.scrollRestoration, 'manual', 'the app owns route scroll restoration');
  equal(sidebar.innerHTMLWrites, 1, 'the sidebar is constructed once');
  equal(topbar.innerHTMLWrites, 1, 'the topbar is constructed once');
  equal(doc.body.classList.contains('auth-shell'), false, 'authenticated routes display the workspace shell');

  nav.scrollTop = 513; app.scroll(830);
  const clicked = await app.click(modelLink.querySelector('span'));
  check(clicked.defaultPrevented, 'internal navigation cancels native hash-anchor scrolling');
  equal(app.location.hash, '#models', 'a sidebar click navigates to its real route');
  equal(win.scrollY, 0, 'a different page starts at its top');
  equal(nav.scrollTop, 513, 'a different sidebar menu keeps navigation scroll position');
  equal(sidebar.querySelector('.nav-scroll'), nav, 'the nav node survives route navigation');
  equal(sidebar.querySelector('[data-nav="models"]'), modelLink, 'the clicked link keeps its DOM identity');
  equal(modelLink.getAttribute('aria-current'), 'page', 'active menu state is updated accessibly');
  equal(stats.push, 1, 'one sidebar click creates one history entry');

  app.scroll(1120, 8); nav.scrollTop = 559; modelLink.focus();
  const rendersBefore = stats.render.get('models');
  const historyBefore = history.length;
  await app.click(modelLink);
  equal(stats.render.get('models'), rendersBefore, 'clicking the active menu is a render no-op');
  equal(history.length, historyBefore, 'clicking the active menu does not duplicate history');
  equal(win.scrollY, 1120, 'clicking the active menu preserves content scroll');
  equal(win.scrollX, 8, 'clicking the active menu preserves horizontal scroll');
  equal(nav.scrollTop, 559, 'clicking the active menu preserves sidebar scroll');
  equal(doc.activeElement, modelLink, 'focused navigation controls remain connected');

  const renderCounts = [sidebar.innerHTMLWrites, topbar.innerHTMLWrites];
  S.state.agents.push({ id: 'extra-agent', name: '临时示例' });
  S.state.runs.push({ id: 'extra-waiting', status: 'waiting' });
  S.state.reviews.push({ id: 'review-1', status: 'pending' }, { id: 'review-2', status: 'pending' });
  S.state.role = 'admin'; S.renderChrome();
  equal(sidebar.innerHTMLWrites, renderCounts[0], 'background counters do not reconstruct the sidebar');
  equal(topbar.innerHTMLWrites, renderCounts[1], 'background counters do not reconstruct the topbar');
  equal(sidebar.querySelector('[data-nav-count="agents"]').textContent, String(S.state.agents.length), 'agent count patches the existing badge');
  equal(sidebar.querySelector('[data-nav-count="tasks"]').textContent, '2', 'waiting-run count is current');
  equal(sidebar.querySelector('[data-nav-count="review"]').textContent, '2', 'review count is current');
  equal(sidebar.querySelector('[data-nav="review"]').hidden, false, 'admin review navigation becomes visible');
  equal(nav.scrollTop, 559, 'role and count changes do not write sidebar scrollTop');
  equal(doc.activeElement, modelLink, 'background chrome updates preserve the focused link');
  S.state.role = 'member'; S.state.runs.forEach(run => { if (run.status === 'waiting') run.status = 'done'; }); S.renderChrome();
  equal(sidebar.querySelector('[data-nav="review"]').hidden, true, 'member role hides the existing review link');
  equal(sidebar.querySelector('[data-nav-count="tasks"]').hidden, true, 'zero-count badges hide without replacing the navigation');
  equal(sidebar.querySelector('.nav-scroll'), nav, 'role changes preserve nav identity');
  equal(nav.scrollTop, 559, 'role changes preserve the modeled nav scroll value');

  app.scroll(840, 9);
  const samePush = stats.push; const sameRender = stats.render.get('models');
  S.go('models');
  equal(stats.render.get('models'), sameRender + 1, 'programmatic same-hash navigation still refreshes page content');
  equal(stats.push, samePush, 'programmatic same-hash refresh does not push duplicate history');
  equal(win.scrollY, 840, 'same-hash refresh restores content scroll');
  equal(win.scrollX, 9, 'same-hash refresh restores horizontal content scroll');
  equal(nav.scrollTop, 559, 'programmatic refresh preserves sidebar scroll');
  S.setDirty(true); const dirtyRender = stats.render.get('models'); S.go('models');
  equal(stats.render.get('models'), dirtyRender, 'same-hash actions do not replace an unsaved draft'); S.setDirty(false);

  S.go('model-detail', { id: 'm1', tab: 'config' });
  equal(win.scrollY, 0, 'entering a detail route resets the content position');
  equal(modelLink.getAttribute('aria-current'), 'page', 'detail routes activate their parent menu');
  app.scroll(420, 5);
  S.go('model-detail', { id: 'm1', tab: 'usage' });
  equal(win.scrollY, 420, 'same-route query changes preserve content position');
  equal(win.scrollX, 5, 'same-route query changes preserve horizontal position');
  app.scroll(780, 7);
  await app.click(qualityLink);
  equal(win.scrollY, 0, 'switching to another section resets content position');
  app.scroll(520, 3);
  const pushesBeforeHistory = stats.push;
  const detailRendersBeforeHistory = stats.render.get('model-detail');
  await history.back();
  equal(app.location.hash, '#model-detail?id=m1&tab=usage', 'back restores the previous query state');
  equal(win.scrollY, 780, 'back restores the exact saved page position');
  equal(win.scrollX, 7, 'back restores the saved horizontal position');
  equal(stats.render.get('model-detail'), detailRendersBeforeHistory + 1, 'popstate plus hashchange render only once');
  await history.forward();
  equal(app.location.hash, '#quality', 'forward restores the next route');
  equal(win.scrollY, 520, 'forward restores its own saved content position');
  equal(stats.push, pushesBeforeHistory, 'history traversal does not add entries');
  await history.back(); await history.back();
  equal(app.location.hash, '#model-detail?id=m1&tab=config', 'back traverses earlier query variants independently');
  equal(win.scrollY, 420, 'each query variant has its own stored position');
  equal(nav.scrollTop, 559, 'all history traversal preserves the sidebar scroll value');
  equal(sidebar.querySelector('.nav-scroll'), nav, 'history traversal never reconstructs the nav');

  app.location.hash = '#tasks'; await app.flushHash();
  equal(S.route, 'tasks', 'direct hash navigation is handled by the same real router');
  equal(win.scrollY, 0, 'a new direct hash route starts at the top');
  const tasksRenders = stats.render.get('tasks');
  await win.emit('hashchange', {});
  equal(stats.render.get('tasks'), tasksRenders, 'a duplicate hashchange does not rerender the current route');
  app.scroll(670); let discarded = false;
  S.setDirty(true, () => { discarded = true; });
  const historyBeforeDirty = history.length;
  S.go('agents');
  equal(S.route, 'tasks', 'unsaved edits keep the current route until a decision');
  equal(history.length, historyBeforeDirty, 'opening the unsaved-edit decision does not alter history');
  check(doc.getElementById('app-dialog').open, 'unsaved navigation opens the actual app dialog');
  equal(win.scrollY, 670, 'opening the decision does not scroll page content');
  S.actions['discard-navigation']();
  check(discarded && !S.dirty, 'discard navigation runs the draft cleanup and clears dirty state');
  equal(S.route, 'agents', 'confirmed navigation reaches the requested route');
  equal(win.scrollY, 0, 'confirmed route change uses the ordinary scroll rule');
  equal(nav.scrollTop, 559, 'confirmation does not reset the sidebar');

  // Real Auth.guard integration: a cold, unauthenticated page never shows the shell.
  const unauth = environment({ hash: '#workflow?id=private-flow&password=ignored' });
  unauth.local.set('otryx-studio-demo', JSON.stringify({ schema: 1, runs: [{ id: 'legacy-running', status: 'running', created: Date.now(), step: 0 }] }));
  const unauthS = unauth.loadCore();
  equal(unauth.location.hash, '#login', 'Auth.guard replaces a protected initial URL with login');
  check(unauth.document.body.classList.contains('auth-shell'), 'login receives the auth shell class');
  equal(unauth.document.getElementById('sidebar').innerHTMLWrites, 0, 'the private sidebar is not rendered on first unauthenticated load');
  equal(unauth.session.get(unauth.A.constants.RETURN_KEY), '#workflow?id=private-flow', 'only the sanitized return destination is retained');
  check(![...unauth.scheduled.values()].some(timer => timer.delay === 1050), 'legacy workspace runs are not scheduled before authentication');
  unauthS.actions['command-search']();
  equal(unauth.document.getElementById('app-dialog').open, false, 'global search cannot open private content before authentication');
  await unauth.document.emit('keydown', { key: 'k', ctrlKey: true, metaKey: false, preventDefault() {} });
  equal(unauth.document.getElementById('app-dialog').open, false, 'the command shortcut does not open search on auth pages');
  unauth.A.enterDemo({ navigate: false }); unauth.A.resume();
  equal(unauth.location.hash, '#workflow?id=private-flow', 'authentication returns to the preserved internal route');
  equal(unauth.stats.reload, 1, 'authentication requires a workspace reload');
  unauth.A.dispose();

  // Account transitions deliberately leave old in-memory state alive until reload.
  // The captured workspace key must continue to protect the newly selected account.
  const shared = new Map([['otryx-studio-demo', JSON.stringify({ schema: 1, spaceName: '原有演示空间', privateMarker: 'demo-only' })]]);
  const alice = environment({ local: shared });
  const aliceIdentity = await alice.A.createAccount({ name: 'Alice', email: 'alice@example.com', password: 'A local demo password', confirm: 'A local demo password' });
  const aliceKey = alice.A.workspaceStorageKey();
  const aliceS = alice.loadCore();
  equal(aliceS.state.privateMarker, undefined, 'a new personal account does not hydrate the old demo workspace');
  aliceS.state.spaceName = 'Alice 的空间'; aliceS.state.privateMarker = 'alice-only'; aliceS.save();
  alice.A.enterDemo({ navigate: false });
  equal(alice.A.getSession().isDemo, true, 'the next identity is selected before the reload');
  aliceS.state.pendingSave = 'late-alice-save'; aliceS.save();
  equal(JSON.parse(shared.get(aliceKey)).pendingSave, 'late-alice-save', 'a late save remains in the startup account workspace');
  equal(JSON.parse(shared.get('otryx-studio-demo')).privateMarker, 'demo-only', 'the selected demo workspace is not overwritten by old account state');
  check(!JSON.parse(shared.get('otryx-studio-demo')).pendingSave, 'no late personal fields leak into the demo workspace');
  alice.A.resume();
  equal(alice.stats.reload, 1, 'a workspace transition reloads module closures');
  const demoReload = environment({ local: shared, session: alice.session });
  const demoS = demoReload.loadCore();
  equal(demoS.state.privateMarker, 'demo-only', 'the reload hydrates the selected demo workspace');
  check(!demoS.state.pendingSave, 'the demo reload contains no personal-account late save');
  const bob = environment({ local: shared });
  const bobIdentity = await bob.A.createAccount({ name: 'Bob', email: 'bob@example.com', password: 'Another demo password', confirm: 'Another demo password' });
  const bobKey = bob.A.workspaceStorageKey();
  const bobS = bob.loadCore();
  check(aliceIdentity.accountId !== bobIdentity.accountId && aliceKey !== bobKey, 'personal accounts have independent startup storage keys');
  equal(bobS.state.privateMarker, undefined, 'another account sees neither Alice nor the legacy demo modifications');
  bobS.state.privateMarker = 'bob-only'; bobS.save();
  equal(JSON.parse(shared.get(bobKey)).privateMarker, 'bob-only', 'the second account saves to its own workspace');
  equal(JSON.parse(shared.get(aliceKey)).privateMarker, 'alice-only', 'the first account remains unchanged');

  // Expiration in an initialized workspace invokes the real guard and cleanup path.
  const expiredNav = bob.document.getElementById('sidebar').querySelector('.nav-scroll');
  expiredNav.scrollTop = 287;
  bobS.state.runs.push({ id: 'active-legacy', status: 'running', created: bob.clock.now });
  bob.clock.now += bob.A.constants.SESSION_TTL + 1;
  bobS.render();
  equal(bobS.route, 'session-expired', 'expired sessions are redirected by the actual core render path');
  check(bob.document.body.classList.contains('auth-shell'), 'expired sessions hide the workspace shell');
  equal(bobS.state.runs.find(run => run.id === 'active-legacy').status, 'stopped', 'expiration stops legacy activity without Runtime metadata');
  equal(bob.document.getElementById('sidebar').querySelector('.nav-scroll'), expiredNav, 'auth transitions do not rebuild cached navigation');
  equal(expiredNav.scrollTop, 287, 'expiration does not mutate the cached navigation scroll');
  check(!bob.A.getSession(), 'the expired identity is no longer valid');
  equal(JSON.parse(shared.get(bobKey)).privateMarker, 'bob-only', 'expiration saves into the captured personal workspace');

  for (const env of [app, alice, demoReload, bob]) env.A.dispose();
  process.stdout.write(`Navigation contract: ${assertions} assertions passed using actual core/auth with a Node DOM/history model. No browser layout or native scroll verification claimed.\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
