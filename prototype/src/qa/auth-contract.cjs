const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto').webcrypto;

const source = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
const rendered = [];
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
function equals(value, expected, message) { assert.equal(value, expected, message); assertions++; }
async function rejected(operation, code) { await assert.rejects(operation, error => error.code === code); assertions++; }

function setup(options = {}) {
  const local = options.local || new Map();
  const session = options.session || new Map();
  const nodes = new Map();
  const listeners = new Map();
  const state = { clock: options.clock || Date.now(), reloads: 0, stopped: [], qualityStopped: [], planningStops: 0, secretsCleared: 0, saves: 0, modal: null, denyLocal: false, denySession: false };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [state.clock])); }
    static now() { return state.clock; }
  }
  const storage = (map, kind) => ({
    getItem(key) { return map.get(key) || null; },
    setItem(key, value) { if (state[kind]) throw new Error('storage denied'); map.set(key, String(value)); },
    removeItem(key) { if (state[kind]) throw new Error('storage denied'); map.delete(key); }
  });
  const location = { hash: '#home', reload() { state.reloads++; } };
  const window = { crypto, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const context = {
    window, location, history: { replaceState(_a, _b, hash) { location.hash = hash; } },
    document: { getElementById: id => nodes.get(id), querySelector: () => ({ textContent: '密码' }) },
    localStorage: storage(local, 'denyLocal'), sessionStorage: storage(session, 'denySession'),
    Date: Clock, TextEncoder, URLSearchParams, Uint8Array, Uint32Array, setInterval, clearInterval, setTimeout, clearTimeout,
    FormData: class { constructor(form) { this.form = form; } get(name) { return this.form.fields[name]?.value ?? null; } },
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'auth.js' });
  const A = window.StudioAuth;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const S = {
    state: { runs: [], qualityData: { experiments: [] } }, session: {}, pages: { home: {}, workflow: {}, models: {}, agent: {} }, actions: {}, forms: {}, timers: new Map(), dirty: false,
    escape, icon: (name, size = 18) => `<svg class="icon" width="${size}" height="${size}" aria-hidden="true"><path d="M3 3h10"/></svg>`,
    btn: (label, action, opts = {}) => `<button type="button" class="btn btn-${opts.variant || 'primary'}" data-action="${escape(action)}" ${opts.attrs || ''}>${escape(label)}</button>`,
    page(route, config) { this.pages[route] = config; }, action(name, fn) { this.actions[name] = fn; }, form(name, fn) { this.forms[name] = fn; },
    modal(opts) { state.modal = opts; }, closeModal() {}, setDirty(value) { this.dirty = value; },
    save() { state.saves++; return true; }, render() {}, toast() {},
    go(route) { location.hash = '#' + route; },
    Runtime: { stop(id) { state.stopped.push(id); } },
    Quality: { stopExperiment(id) { state.qualityStopped.push(id); } },
    Planning: { stopAll() { state.planningStops++; } },
    Publishing: { clearSession() { state.secretsCleared++; } }
  };
  A.attach(S);
  function form(values) {
    const fields = {};
    const messages = {};
    const fieldNames = ['name', 'email', 'password', 'confirm', 'code', 'remember'];
    fieldNames.forEach(name => {
      fields[name] = { name, id: 'auth-' + name, type: ['password', 'confirm'].includes(name) ? 'password' : 'text', value: values[name] || '', attributes: {}, setAttribute(key, val) { this.attributes[key] = val; }, removeAttribute(key) { delete this.attributes[key]; }, focus() { this.focused = true; } };
      messages[name] = { textContent: '' };
      nodes.set('auth-' + name, fields[name]);
    });
    const button = { innerHTML: '提交', disabled: false, setAttribute() {}, removeAttribute() {} };
    const notice = { hidden: true, textContent: '', focus() { this.focused = true; } };
    return {
      fields, messages, button, notice, dataset: {},
      querySelector(selector) {
        if (selector === '[type="submit"]') return button;
        if (selector === '#auth-form-error') return notice;
        return messages[selector.match(/^#auth-(.+)-error$/)?.[1]] || null;
      },
      querySelectorAll(selector) { return Object.values(fields).filter(field => selector === 'input' || ['password', 'confirm', 'code'].includes(field.name)); }
    };
  }
  return { A, S, local, session, context, location, state, form, nodes, listeners };
}

const account = { name: '测试者', email: 'member@example.com', password: 'Local demo password 2026', confirm: 'Local demo password 2026' };

(async () => {
  const first = setup();
  const { A, S, local, session, state } = first;
  const keys = A.constants;
  equals(A.getSession(), null, 'first visit has no session');
  equals(A.workspaceStorageKey(), 'otryx-studio-demo', 'unauthenticated preload can still hydrate the demo seed');
  equals(A.guard('#workflow?id=flow-a&tab=nodes'), '#login', 'protected routes require sign-in');
  equals(session.get(keys.RETURN_KEY), '#workflow?id=flow-a&tab=nodes', 'return target is preserved separately from the URL');
  for (const target of ['https://outside.example', '//outside.example', '#//outside.example', '#login?redirect=evil', '#home#https://outside.example', '#home\\evil', 'javascript:evil']) {
    equals(A.safeReturnHash(target), '#home', 'external and malformed return targets are rejected');
  }
  equals(A.safeReturnHash('#workflow?id=demo&password=clear-secret&token=clear-token&tab=nodes'), '#workflow?id=demo&tab=nodes', 'sensitive and arbitrary query parameters are discarded');
  equals(A.guard('#login?password=secret'), '#login', 'auth routes discard query strings');

  await rejected(A.createAccount({ ...account, name: '', password: 'short', confirm: 'different' }), 'validation');
  check(!local.has(keys.ACCOUNT_KEY), 'invalid registration writes nothing');
  local.set('otryx-studio-demo', JSON.stringify({ marker: 'existing-demo-only' }));
  const user = await A.createAccount({ ...account, email: ' Member@Example.com ' });
  check(/^u-[a-f0-9]{24}$/.test(user.accountId), 'account IDs are independently generated');
  equals(user.email, 'member@example.com', 'emails are normalized');
  const workspaceA = A.workspaceStorageKey();
  equals(workspaceA, 'otryx-studio-workspace::' + user.accountId, 'the account owns a dedicated workspace key');
  check(!local.has(workspaceA), 'the auth adapter does not clone the old demo workspace into a personal account');
  equals(JSON.parse(local.get('otryx-studio-demo')).marker, 'existing-demo-only', 'legacy workspace remains untouched');
  const stored = JSON.parse(local.get(keys.ACCOUNT_KEY)).accounts[0];
  check(/^[a-f0-9]{64}$/.test(stored.verifier) && /^[a-f0-9]{32}$/.test(stored.salt), 'only a salted password verifier is saved');
  check(stored.iterations >= 100000, 'PBKDF2 performs a deliberate work factor');
  check(!JSON.stringify([...local, ...session]).includes(account.password), 'raw passwords never enter persistent or session storage');
  check(!('password' in stored) && !('confirm' in stored), 'account records do not retain credential fields');
  check(!('verifier' in user) && !('salt' in user), 'the public identity excludes verification material');
  equals(A.guard('#workflow?id=flow-a'), '#workflow?id=flow-a', 'signed-in users can open a protected route');
  A.resume();
  equals(first.location.hash, '#workflow?id=flow-a&tab=nodes', 'successful sign-in resumes the originally blocked route');
  equals(state.reloads, 1, 'workspace modules are reinitialized after login');
  check(!session.has(keys.RETURN_KEY), 'the consumed return destination is removed');

  await rejected(A.createAccount(account), 'exists');
  await rejected(A.signIn({ email: account.email, password: 'incorrect password' }), 'credentials');
  const unknown = first.form({ email: 'unknown@example.com', password: 'incorrect password' });
  await S.forms['auth-login'](unknown);
  equals(unknown.notice.textContent, '邮箱或密码不正确，请检查后重试。', 'unknown users receive the same credential error');
  equals(unknown.fields.password.value, '', 'password input clears after a credential failure');
  check(!unknown.button.disabled && !unknown.dataset.authBusy, 'failed submissions release the loading state');
  const invalid = first.form({ name: '', email: 'bad', password: '123', confirm: '456' });
  await S.forms['auth-register'](invalid);
  check(invalid.messages.name.textContent && invalid.messages.email.textContent && invalid.messages.confirm.textContent, 'registration shows errors beside individual fields');
  check(invalid.fields.name.focused, 'invalid submission focuses the first error');
  check(!invalid.notice.hidden, 'the form error is persistent and announced');

  const visibility = { dataset: { input: 'auth-password' }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  S.actions['auth-toggle-password'](visibility);
  equals(invalid.fields.password.type, 'text', 'password visibility is functional');
  equals(visibility.attributes['aria-pressed'], 'true', 'visibility state is announced');
  S.actions['auth-toggle-password'](visibility);
  equals(invalid.fields.password.type, 'password', 'the password can be concealed again');

  const pending = A.signIn({ email: account.email, password: account.password });
  await rejected(A.signIn({ email: account.email, password: account.password }), 'busy');
  await pending;
  const userB = await A.createAccount({ name: '另一个人', email: 'second@example.com', password: account.password, confirm: account.password });
  check(userB.accountId !== user.accountId && A.workspaceStorageKey() !== workspaceA, 'two local accounts cannot address the same workspace');
  await A.signIn({ email: account.email, password: account.password, remember: true });
  const remembered = JSON.parse(local.get(keys.REMEMBER_KEY));
  equals(remembered.expiresAt - remembered.issuedAt, keys.REMEMBER_TTL, 'remembered sign-in has a bounded seven-day lifetime');
  check(Object.keys(remembered).every(key => ['version', 'accountId', 'sessionId', 'authVersion', 'issuedAt', 'expiresAt', 'remember'].includes(key)), 'remembered metadata contains no credentials');
  const newTab = setup({ local, session: new Map(), clock: state.clock });
  equals(newTab.A.getSession()?.accountId, user.accountId, 'a remembered session restores the correct identity');
  newTab.A.dispose();

  const beforeReset = new Map(session);
  const reset = A.beginReset(account.email);
  check(/^\d{6}$/.test(reset.code), 'the local reset challenge is usable');
  check(!JSON.stringify([...local, ...session]).includes('"code"'), 'reset codes never enter persistent storage');
  check(!first.location.hash.includes(reset.code), 'reset codes are absent from the URL');
  const resetHtml = S.pages['reset-password'].render();
  check(resetHtml.includes('没有发送邮件') && resetHtml.includes('不能验证') && resetHtml.includes('演示验证码'), 'reset does not claim email delivery or verified ownership');
  rendered.push({ route: 'reset-password-active', html: resetHtml });
  await rejected(A.resetPassword({ code: reset.code === '999999' ? '000000' : '999999', password: 'A changed local password', confirm: 'A changed local password' }), 'reset-invalid');
  await A.resetPassword({ code: reset.code, password: 'A changed local password', confirm: 'A changed local password' });
  equals(A.getSession(), null, 'password reset invalidates the current session');
  equals(A.resetChallenge(), null, 'a reset challenge can be used only once');
  const oldTab = setup({ local, session: beforeReset, clock: state.clock });
  equals(oldTab.A.getSession(), null, 'previous sessions fail after the account version changes');
  oldTab.A.dispose();
  await rejected(A.resetPassword({ code: reset.code, password: 'A changed local password', confirm: 'A changed local password' }), 'reset-expired');
  await rejected(A.signIn({ email: account.email, password: account.password }), 'credentials');
  await A.signIn({ email: account.email, password: 'A changed local password' });
  check(A.getSession(), 'the new password signs in');
  const unknownReset = A.beginReset('missing@example.com');
  await rejected(A.resetPassword({ code: unknownReset.code, password: 'Some local password', confirm: 'Some local password' }), 'reset-invalid');
  equals(JSON.parse(local.get(keys.ACCOUNT_KEY)).accounts.length, 2, 'resetting an unknown email does not create an account');
  A.beginReset(account.email);
  const freshPage = setup({ local, session, clock: state.clock });
  equals(freshPage.A.resetChallenge(), null, 'refreshing discards the reset challenge');
  check(freshPage.S.pages['reset-password'].render().includes('重新开始密码重置'), 'a missing reset challenge offers a recovery route');
  freshPage.A.dispose();
  state.clock += keys.RESET_TTL + 1;
  equals(A.resetChallenge(), null, 'reset challenges expire after ten minutes');

  // Logging out stops in-flight work and clears API credentials without deleting user content.
  first.location.hash = '#workflow?id=flow-a';
  S.state.runs = [{ id: 'run-active', status: 'running', engine: 'graph', toolCalls: [] }, { id: 'legacy-waiting', status: 'waiting' }, { id: 'run-done', status: 'success' }];
  S.state.qualityData.experiments = [{ id: 'eval-active', status: 'running' }];
  S.dirty = true;
  const stopsBefore = state.stopped.length;
  equals(A.logout(), false, 'unsaved edits receive an in-app decision');
  check(state.modal?.title.includes('未保存'), 'logout names the unsaved edits');
  equals(state.stopped.length, stopsBefore, 'cancelable logout does not stop work before a decision');
  S.actions['auth-confirm-logout']();
  check(state.stopped.includes('run-active') && !state.stopped.includes('run-done'), 'logout stops only active runs');
  equals(S.state.runs.find(run => run.id === 'legacy-waiting').status, 'stopped', 'legacy demo runs without Runtime metadata also stop without throwing');
  check(state.qualityStopped.includes('eval-active') && state.planningStops > 0, 'quality and planning activity are also stopped');
  check(state.secretsCleared > 0, 'session-only API credentials are cleared');
  equals(A.getSession(), null, 'logout invalidates the local session');
  check(!session.has(keys.SESSION_KEY) && !local.has(keys.REMEMBER_KEY), 'logout removes both tab and remembered session metadata');
  equals(first.location.hash, '#login', 'logout returns to the login page');
  equals(JSON.parse(local.get('otryx-studio-demo')).marker, 'existing-demo-only', 'logout preserves the legacy demo content');
  A.enterDemo({ navigate: false });
  equals(A.workspaceStorageKey(), 'otryx-studio-demo', 'the one-click demo resumes only the original demo workspace');
  check(A.getSession().isDemo, 'demo identity is explicit');
  first.location.hash = '#workflow?id=flow-a';
  state.clock += keys.SESSION_TTL + 1;
  equals(A.guard(first.location.hash), '#session-expired', 'expired sessions lead to a dedicated recovery page');
  equals(A.getSession(), null, 'an expired session cannot access a workspace');
  equals(session.get(keys.RETURN_KEY), '#workflow?id=flow-a', 'expiration keeps a safe return destination');

  // A failed persistent write or a denied session store must not claim registration success.
  const blocked = setup();
  blocked.state.denyLocal = true;
  await rejected(blocked.A.createAccount(account), 'storage');
  equals(blocked.A.getSession(), null, 'failed account persistence creates no session');
  blocked.state.denyLocal = false;
  blocked.state.denySession = true;
  await rejected(blocked.A.createAccount(account), 'storage');
  check(!blocked.local.has(keys.ACCOUNT_KEY), 'registration rolls back when the session cannot be saved');
  equals(blocked.A.getSession(), null, 'session storage failure does not enter the workspace');
  blocked.A.dispose();

  for (const route of ['login', 'register', 'forgot-password', 'reset-password', 'session-expired']) {
    const html = S.pages[route].render();
    rendered.push({ route, html });
    check(html.includes('本地交互原型'), `${route} declares its prototype scope`);
    check(!/<form(?![^>]*novalidate)/.test(html), `${route} uses inline application validation`);
  }
  check(S.pages.login.render().includes('autocomplete="current-password"'), 'login supports password managers');
  check(S.pages.register.render().includes('autocomplete="new-password"'), 'registration uses new-password autofill');
  check(!source.includes('onpaste') && !source.includes('preventDefault()'), 'authentication does not block password paste');
  check(!JSON.stringify([...local, ...session]).includes('A changed local password'), 'changed passwords are never serialized');
  A.dispose();
  fs.mkdirSync(path.join(__dirname, '.generated'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.generated', 'auth-rendered.json'), JSON.stringify(rendered, null, 2));
  process.stdout.write(`Auth contract: ${assertions} assertions passed; ${rendered.length} page states rendered.\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
