(function () {
  'use strict';

  // This adapter is deliberately independent of Studio.state and workspace exports.
  // It is a local interaction prototype, not a production authentication service.
  const ACCOUNT_KEY = 'otryx-auth-accounts-v1';
  const SESSION_KEY = 'otryx-auth-session-v1';
  const REMEMBER_KEY = 'otryx-auth-remember-v1';
  const RETURN_KEY = 'otryx-auth-return-v1';
  const LEGACY_WORKSPACE = 'otryx-studio-demo';
  const ITERATIONS = 120000;
  const SESSION_TTL = 12 * 60 * 60 * 1000;
  const REMEMBER_TTL = 7 * 24 * 60 * 60 * 1000;
  const RESET_TTL = 10 * 60 * 1000;
  const AUTH_ROUTES = new Set(['login', 'register', 'forgot-password', 'reset-password', 'session-expired']);
  const RETURN_PARAMS = new Set(['id', 'tab', 'agent', 'mode', 'model', 'session', 'node', 'tool', 'days', 'group', 'page', 'version', 'archived', 'compare', 'result', 'split', 'call', 'execution', 'filter', 'plan']);
  let studio = null;
  let challenge = null;
  let credentialBusy = false;
  let expiryTimer = null;
  let invalidReason = '';
  let forcedSignedOut = false;
  let flash = '';
  let resetEmail = '';
  let watchedSession = null;
  let workspaceStopping = false;

  class AuthError extends Error {
    constructor(code, message, fields) {
      super(message);
      this.name = 'AuthError';
      this.code = code;
      this.fields = fields || {};
    }
  }

  const fail = (code, message, fields) => new AuthError(code, message, fields);
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const validAccountId = value => /^u-[a-f0-9]{24}$/.test(String(value || ''));
  const getStorage = kind => {
    try {
      return kind === 'session' ? (typeof sessionStorage !== 'undefined' ? sessionStorage : null) : (typeof localStorage !== 'undefined' ? localStorage : null);
    } catch (_) { return null; }
  };
  const read = (key, kind = 'local') => {
    try { return getStorage(kind)?.getItem(key) || null; } catch (_) { return null; }
  };
  const write = (key, value, kind = 'local') => {
    const storage = getStorage(kind);
    if (!storage) throw fail('storage', '当前浏览器无法保存本地账户或会话，请允许浏览器存储后重试。');
    try {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    } catch (_) { throw fail('storage', '保存未完成：浏览器存储不可用或空间不足。你的输入仍保留在当前页面。'); }
  };
  const removeQuietly = (key, kind = 'local') => {
    try { write(key, null, kind); return true; } catch (_) { return false; }
  };
  const parse = value => { try { return value ? JSON.parse(value) : null; } catch (_) { return null; } };

  function readAccounts(strict = false) {
    const raw = read(ACCOUNT_KEY);
    if (!raw) return [];
    const data = parse(raw);
    const valid = data?.version === 1 && Array.isArray(data.accounts) && data.accounts.every(account =>
      validAccountId(account.id) && typeof account.name === 'string' && account.name.length <= 32 && validEmail(String(account.email || '')) &&
      /^[a-f0-9]{32}$/.test(account.salt || '') && /^[a-f0-9]{64}$/.test(account.verifier || '') &&
      Number.isInteger(account.iterations) && account.iterations >= 100000 && account.iterations <= 400000 &&
      Number.isInteger(account.authVersion) && account.authVersion > 0);
    if (!valid) {
      if (strict) throw fail('account-store', '本地账户记录无法读取，原数据未被覆盖。你仍可进入独立的演示空间。');
      return [];
    }
    return data.accounts;
  }

  function cryptoApi() {
    const crypto = window.crypto;
    if (!crypto?.subtle || !crypto?.getRandomValues) throw fail('crypto', '当前环境不支持安全的本地密码校验。请通过 HTTPS 或 localhost 打开原型；也可以直接进入演示空间。');
    return crypto;
  }

  const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  function randomHex(length) { const bytes = new Uint8Array(length); cryptoApi().getRandomValues(bytes); return hex(bytes); }
  async function derive(password, salt, iterations = ITERATIONS) {
    const crypto = cryptoApi();
    const bytes = new TextEncoder().encode(password);
    try {
      const key = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
      const saltBytes = Uint8Array.from(salt.match(/.{2}/g), x => parseInt(x, 16));
      return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256)));
    } finally { bytes.fill(0); }
  }
  function equalVerifier(left, right) {
    if (left.length !== right.length) return false;
    let different = 0;
    for (let i = 0; i < left.length; i++) different |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return different === 0;
  }

  function validateCredentials(values, creating = false) {
    const fields = {};
    const email = normalizeEmail(values.email);
    if (!email) fields.email = '请输入邮箱。';
    else if (!validEmail(email)) fields.email = '请输入完整的邮箱地址，例如 name@example.com。';
    if (!values.password) fields.password = '请输入密码。';
    else if (String(values.password).length > 128) fields.password = '密码最多 128 个字符。';
    else if (creating && String(values.password).length < 8) fields.password = '密码至少需要 8 个字符。';
    if (creating) {
      const name = String(values.name || '').trim();
      if (!name) fields.name = '请输入你的称呼。';
      else if (name.length > 32) fields.name = '称呼最多 32 个字符。';
      if (values.confirm !== values.password) fields.confirm = '两次输入的密码不一致。';
    }
    return fields;
  }

  async function exclusive(operation) {
    if (credentialBusy) throw fail('busy', '正在处理上一次请求，请稍候。');
    credentialBusy = true;
    try { return await operation(); } finally { credentialBusy = false; }
  }

  function clearSession() {
    forcedSignedOut = true;
    const sessionCleared = removeQuietly(SESSION_KEY, 'session');
    const rememberCleared = removeQuietly(REMEMBER_KEY);
    return sessionCleared && rememberCleared;
  }

  function sessionRecord(account, remember) {
    const now = Date.now();
    return {
      version: 1,
      accountId: account.id,
      sessionId: randomHex(12),
      authVersion: account.authVersion || 0,
      issuedAt: now,
      expiresAt: now + (remember ? REMEMBER_TTL : SESSION_TTL),
      remember: !!remember
    };
  }

  function storeSession(record) {
    const previousIdentity = getSession();
    const previous = read(SESSION_KEY, 'session');
    const previousRemember = read(REMEMBER_KEY);
    try {
      write(SESSION_KEY, JSON.stringify(record), 'session');
      write(REMEMBER_KEY, record.remember ? JSON.stringify(record) : null);
    } catch (error) {
      try { write(SESSION_KEY, previous, 'session'); } catch (_) { /* Surface the original storage failure. */ }
      try { write(REMEMBER_KEY, previousRemember); } catch (_) { /* No success is reported. */ }
      throw error;
    }
    if (previousIdentity) stopWorkspace();
    forcedSignedOut = false;
    invalidReason = '';
    return getSession();
  }

  function getSession() {
    if (forcedSignedOut) return null;
    const tabRaw = read(SESSION_KEY, 'session');
    const persistentRaw = tabRaw ? null : read(REMEMBER_KEY);
    const record = parse(tabRaw || persistentRaw);
    if (!record) return null;
    const now = Date.now();
    const lifetime = record.remember ? REMEMBER_TTL : SESSION_TTL;
    const account = record.accountId === 'demo' ? { id: 'demo', name: '演示空间', email: '', authVersion: 0 } : readAccounts().find(item => item.id === record.accountId);
    const valid = record.version === 1 && typeof record.sessionId === 'string' && /^[a-f0-9]{24}$/.test(record.sessionId) &&
      Number.isFinite(record.issuedAt) && Number.isFinite(record.expiresAt) && record.issuedAt <= now + 60000 &&
      record.expiresAt > record.issuedAt && record.expiresAt - record.issuedAt <= lifetime + 1000 &&
      account && account.authVersion === record.authVersion && !(record.accountId === 'demo' && record.remember);
    if (!valid || record.expiresAt <= now) {
      invalidReason = record.expiresAt <= now ? 'expired' : 'revoked';
      clearSession();
      return null;
    }
    if (persistentRaw) {
      try { write(SESSION_KEY, persistentRaw, 'session'); } catch (_) { return null; }
    }
    return { id: account.id, accountId: account.id, name: account.name, email: account.email, kind: account.id === 'demo' ? 'demo' : 'local', isDemo: account.id === 'demo', issuedAt: record.issuedAt, expiresAt: record.expiresAt, remember: !!record.remember, sessionId: record.sessionId };
  }

  function workspaceStorageKey() {
    const session = getSession();
    return window.StudioSpaces?.active()?.storageKey || (session && !session.isDemo ? 'otryx-studio-workspace::' + session.accountId : LEGACY_WORKSPACE);
  }

  function safeReturnHash(value) {
    if (typeof value !== 'string' || value.length > 1500 || !value.startsWith('#') || /[\u0000-\u001f\u007f\\]/.test(value)) return '#home';
    const match = value.match(/^#([a-z][a-z0-9-]{0,50})(?:\?([^#]*))?$/);
    if (!match || AUTH_ROUTES.has(match[1])) return '#home';
    if (studio && !studio.pages[match[1]]) return '#home';
    const safe = new URLSearchParams();
    for (const [key, val] of new URLSearchParams(match[2] || '')) {
      if (RETURN_PARAMS.has(key) && val.length <= 160 && !/[\u0000-\u001f\u007f]/.test(val)) safe.set(key, val);
    }
    return '#' + match[1] + (safe.size ? '?' + safe.toString() : '');
  }

  function rememberReturn(value) {
    const target = safeReturnHash(value);
    try { write(RETURN_KEY, target, 'session'); } catch (_) { /* A blocked return destination never blocks sign-in. */ }
    return target;
  }
  function returnDestination() { return safeReturnHash(read(RETURN_KEY, 'session') || '#home'); }
  const isAuthRoute = route => AUTH_ROUTES.has(String(route || '').replace(/^#/, '').split('?')[0]);

  function stopWorkspace(reason = 'session-ended') {
    if (!studio || workspaceStopping) return false;
    workspaceStopping = true;
    try {
      try { studio.Planning?.stopAll?.(reason); } catch (error) { if (reason === 'space-switch') throw error; /* Individual runs are stopped below as well. */ }
      for (const experiment of studio.state.qualityData?.experiments || []) {
        if (experiment.status === 'running') studio.Quality?.stopExperiment(experiment.id);
      }
      for (const run of studio.state.runs || []) {
        if (!['running', 'waiting', 'queued', 'pending'].includes(run.status)) continue;
        // Historical demo rows predate Runtime and do not contain its tool-call array.
        if (Array.isArray(run.toolCalls) && studio.Runtime?.stop) studio.Runtime.stop(run.id);
        else {
          run.status = 'stopped';
          run.finishedAt = Date.now();
          run.duration = run.finishedAt - (run.created || run.finishedAt);
          run.pending = null;
          run.pendingQueue = [];
          run.stopReason = reason === 'space-switch' ? '切换空间，已停止本地执行。' : '登录会话结束，已停止本地执行。';
        }
      }
      studio.Publishing?.clearSession();
      studio.Models?.clearSession?.();
      studio.timers?.forEach(timer => { clearTimeout(timer); clearInterval(timer); });
      studio.timers?.clear();
      studio.closeModal?.();
      studio.session = {};
      return studio.save?.() !== false;
    } finally { workspaceStopping = false; }
  }

  function guard(hash) {
    const route = String(hash || '#home').slice(1).split('?')[0];
    if (isAuthRoute(route)) return '#' + route;
    const session = getSession();
    if (session) return safeReturnHash(hash || '#home');
    rememberReturn(hash || '#home');
    if (invalidReason) {
      stopWorkspace();
      return '#session-expired';
    }
    return '#login';
  }

  function navigate(hash, reload = false) {
    if (studio) { studio.setDirty?.(false); studio.closeModal?.(); }
    history.replaceState(null, '', hash);
    if (reload) location.reload(); else if (studio) studio.render();
  }

  function resume() {
    const next = returnDestination();
    removeQuietly(RETURN_KEY, 'session');
    challenge = null;
    resetEmail = '';
    watchedSession = getSession();
    navigate(next, true);
  }

  async function createAccount(values) {
    return exclusive(async () => {
      const fields = validateCredentials(values, true);
      if (Object.keys(fields).length) throw fail('validation', '请检查标记的字段。', fields);
      const email = normalizeEmail(values.email);
      const accounts = readAccounts(true);
      if (accounts.some(account => account.email === email)) throw fail('exists', '此邮箱已在当前浏览器创建账户，请登录或使用本地密码重置。', { email: '这个本地账户已存在。' });
      const salt = randomHex(16);
      const verifier = await derive(String(values.password), salt);
      // Recheck after the asynchronous derivation so a second tab cannot silently duplicate an account.
      const current = readAccounts(true);
      if (current.some(account => account.email === email)) throw fail('exists', '此邮箱已在当前浏览器创建账户，请直接登录。', { email: '这个本地账户已存在。' });
      const account = { id: 'u-' + randomHex(12), name: String(values.name).trim(), email, salt, verifier, iterations: ITERATIONS, authVersion: 1, createdAt: Date.now(), updatedAt: Date.now() };
      const previous = read(ACCOUNT_KEY);
      write(ACCOUNT_KEY, JSON.stringify({ version: 1, accounts: [...current, account] }));
      try { return storeSession(sessionRecord(account, !!values.remember)); }
      catch (error) {
        // Keep registration atomic when session storage is denied.
        try { write(ACCOUNT_KEY, previous); } catch (_) { /* The error remains visible; no session success is claimed. */ }
        throw error;
      }
    });
  }

  async function signIn(values) {
    return exclusive(async () => {
      const fields = validateCredentials(values);
      if (Object.keys(fields).length) throw fail('validation', '请检查标记的字段。', fields);
      if (normalizeEmail(values.email) === 'demo@peachagent.local' && values.password === 'PeachAgent@2026') return enterDemo({ navigate: false });
      const account = readAccounts(true).find(item => item.email === normalizeEmail(values.email));
      const verifier = await derive(String(values.password), account?.salt || '00000000000000000000000000000000', account?.iterations || ITERATIONS);
      if (!account || !equalVerifier(verifier, account.verifier)) throw fail('credentials', '邮箱或密码不正确，请检查后重试。');
      const fresh = readAccounts(true).find(item => item.id === account.id);
      if (!fresh || fresh.authVersion !== account.authVersion) throw fail('credentials', '账户状态已更新，请重新登录。');
      return storeSession(sessionRecord(fresh, !!values.remember));
    });
  }

  function enterDemo(options = {}) {
    // The demo has no password and needs only random session metadata, not WebCrypto.subtle.
    const now = Date.now();
    const bytes = new Uint8Array(12);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const session = storeSession({ version: 1, accountId: 'demo', sessionId: hex(bytes), authVersion: 0, issuedAt: now, expiresAt: now + SESSION_TTL, remember: false });
    if (options.navigate !== false) resume();
    return session;
  }

  function beginReset(email) {
    email = normalizeEmail(email);
    if (!validEmail(email)) throw fail('validation', '请输入完整的邮箱地址。', { email: '请输入完整的邮箱地址，例如 name@example.com。' });
    const bytes = new Uint32Array(1);
    cryptoApi().getRandomValues(bytes);
    const account = readAccounts(true).find(item => item.email === email);
    challenge = { id: randomHex(12), email, accountId: account?.id || null, authVersion: account?.authVersion || 0, code: String(bytes[0] % 1000000).padStart(6, '0'), expiresAt: Date.now() + RESET_TTL, attempts: 0 };
    resetEmail = email;
    return resetChallenge();
  }

  function resetChallenge() {
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) return null;
    return { email: challenge.email, code: challenge.code, expiresAt: challenge.expiresAt };
  }

  async function resetPassword(values) {
    return exclusive(async () => {
      const fields = {};
      if (!/^\d{6}$/.test(String(values.code || '').trim())) fields.code = '请输入 6 位演示验证码。';
      if (!values.password || String(values.password).length < 8) fields.password = '新密码至少需要 8 个字符。';
      else if (String(values.password).length > 128) fields.password = '新密码最多 128 个字符。';
      if (values.confirm !== values.password) fields.confirm = '两次输入的密码不一致。';
      if (Object.keys(fields).length) throw fail('validation', '请检查标记的字段。', fields);
      if (!resetChallenge()) throw fail('reset-expired', '演示验证码已失效，请重新开始密码重置。');
      const currentChallenge = challenge;
      currentChallenge.attempts++;
      const accounts = readAccounts(true);
      const account = accounts.find(item => item.id === currentChallenge.accountId);
      if (String(values.code).trim() !== currentChallenge.code || !account || account.authVersion !== currentChallenge.authVersion) {
        if (currentChallenge.attempts >= 5) challenge = null;
        throw fail('reset-invalid', '无法完成本地重置，请核对邮箱和演示验证码，或重新开始。', { code: '邮箱或演示验证码不匹配。' });
      }
      const salt = randomHex(16);
      const verifier = await derive(String(values.password), salt);
      if (challenge !== currentChallenge || currentChallenge.expiresAt <= Date.now()) throw fail('reset-expired', '演示验证码已失效，请重新开始密码重置。');
      const fresh = readAccounts(true);
      const index = fresh.findIndex(item => item.id === account.id && item.authVersion === account.authVersion);
      if (index < 0) throw fail('reset-invalid', '账户状态已更新，请重新开始密码重置。');
      fresh[index] = { ...fresh[index], salt, verifier, authVersion: account.authVersion + 1, updatedAt: Date.now() };
      write(ACCOUNT_KEY, JSON.stringify({ version: 1, accounts: fresh }));
      const active = parse(read(SESSION_KEY, 'session'));
      const remembered = parse(read(REMEMBER_KEY));
      if (active?.accountId === account.id) { stopWorkspace(); clearSession(); }
      else if (remembered?.accountId === account.id) removeQuietly(REMEMBER_KEY);
      challenge = null;
      flash = '本地密码已更新。请使用新密码登录，之前的登录会话已失效。';
      return true;
    });
  }

  function logout(options = {}) {
    if (studio?.dirty && !options.force) {
      studio.modal({ title: '退出前处理未保存的修改', subtitle: '已保存的工作空间内容会保留。当前未保存的编辑将在退出后丢失。', body: '<div class="notice warning">正在执行的本地任务也会停止。重新登录后可查看已有运行记录。</div>', footer: studio.btn('继续编辑', 'modal-close', { variant: 'secondary' }) + studio.btn('放弃修改并退出', 'auth-confirm-logout', { variant: 'danger' }) });
      return false;
    }
    stopWorkspace();
    challenge = null;
    resetEmail = '';
    watchedSession = null;
    invalidReason = '';
    const cleared = clearSession();
    removeQuietly(RETURN_KEY, 'session');
    flash = cleared ? '你已退出登录。已保存的内容会在下次登录后恢复。' : '当前页面已退出，但浏览器阻止了清除持久会话。请在浏览器设置中清除此站点的本地数据后关闭页面。';
    navigate('#login', cleared);
    return cleared;
  }

  function expire() {
    if (isAuthRoute(location.hash)) return;
    rememberReturn(location.hash);
    stopWorkspace();
    invalidReason = 'expired';
    clearSession();
    watchedSession = null;
    navigate('#session-expired');
  }

  function watchSession() {
    if (!studio || isAuthRoute(location.hash)) return;
    const current = getSession();
    if (!current && watchedSession) expire();
    else if (current && watchedSession && current.accountId !== watchedSession.accountId) {
      stopWorkspace();
      location.reload();
    } else if (current) watchedSession = current;
  }

  function openAccount() {
    if (!studio) return;
    const session = getSession();
    if (!session) { studio.go('login'); return; }
    const demo = session.isDemo;
    const expiry = new Date(session.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    studio.modal({ title: session.name, subtitle: demo ? '公共演示空间 · 当前浏览器' : session.email, body: `<div class="auth-account-summary"><span class="avatar">${studio.icon(demo ? 'play' : 'users', 21)}</span><div><strong>${demo ? '演示空间' : '个人工作空间'}</strong><p>${demo ? '保留原有示例和你的演示修改。' : '内容按本地账户分别保存。'}</p></div></div><div class="notice">${demo ? '此空间不需要注册。创建本地账户后，将进入独立空间，演示内容不会迁入。' : '这是当前浏览器的本地演示账户，不是云端账号，也不会同步到其他设备。'}</div><dl class="auth-account-details"><div><dt>登录有效期</dt><dd>${studio.escape(expiry)}（北京时间）</dd></div><div><dt>会话方式</dt><dd>${session.remember ? '记住登录 · 最长 7 天' : '当前浏览器会话 · 最长 12 小时'}</dd></div></dl>${demo && studio.actions['role-member'] ? `<div class="auth-role-options">${studio.btn('个人空间视角', 'role-member', { variant: 'secondary', small: true })}${studio.btn('管理员演示', 'role-admin', { variant: 'secondary', small: true })}</div>` : ''}`, footer: studio.btn('关闭', 'modal-close', { variant: 'secondary' }) + studio.btn('退出登录', 'auth-logout', { variant: 'ghost', icon: 'logout' }) });
  }

  function field(label, name, options = {}) {
    const id = 'auth-' + name;
    const password = options.type === 'password';
    const described = `${id}-error${options.help ? ' ' + id + '-help' : ''}`;
    return `<div class="field"><label class="field-label" for="${id}">${studio.escape(label)}<span class="required-star">*</span></label><div class="${password ? 'auth-password' : 'auth-input-wrap'}"><input class="input" id="${id}" name="${name}" type="${options.type || 'text'}" value="${studio.escape(options.value || '')}" autocomplete="${options.autocomplete || 'off'}"${options.inputmode ? ` inputmode="${options.inputmode}"` : ''} maxlength="${options.maxlength || (password ? 128 : 254)}" placeholder="${studio.escape(options.placeholder || '')}" aria-describedby="${described}" required${name === 'email' ? ' autocapitalize="none" spellcheck="false"' : ''}>${password ? `<button type="button" class="auth-password-toggle" data-action="auth-toggle-password" data-input="${id}" aria-label="显示${studio.escape(label)}" aria-pressed="false">${studio.icon('eye', 17)}<span>显示</span></button>` : ''}</div>${options.help ? `<p class="field-help" id="${id}-help">${studio.escape(options.help)}</p>` : ''}<p class="field-error" id="${id}-error"></p></div>`;
  }

  function formError() { return '<div class="notice error auth-form-error" id="auth-form-error" role="alert" tabindex="-1" hidden></div>'; }
  function submit(label) { return `<button type="submit" class="btn btn-primary auth-submit"><span>${studio.escape(label)}</span>${studio.icon('arrow', 16)}</button>`; }
  function rememberField() { return '<label class="auth-check" for="auth-remember"><input type="checkbox" id="auth-remember" name="remember"><span>记住登录 7 天</span></label>'; }
  function brand() { return `<a class="auth-brand" href="#login" aria-label="OTRYX Studio 登录"><span class="auth-brand-symbol">${studio.icon('layers', 23)}</span><span>OTRYX <span class="auth-brand-sub">Studio</span></span></a>`; }

  function layout(title, description, content, active = 'login') {
    const session = getSession();
    return `<div class="auth-page"><header class="auth-top">${brand()}<span class="auth-prototype-label">本地交互原型</span>${window.StudioAppearance?.controls()||''}${session ? '<a class="auth-back" href="#home">返回工作空间</a>' : `<a class="auth-back" href="#${active === 'register' ? 'login' : 'register'}">${active === 'register' ? '已有账户？登录' : '创建本地账户'}</a>`}</header><div class="auth-layout"><aside class="auth-intro" aria-label="工作空间介绍"><p class="eyebrow">YOUR AI WORKSPACE</p><h2>从一个想法，<br>到可运行的应用。</h2><p class="auth-intro-description">在同一个空间里构建智能体、编排工作流，<br class="auth-desktop-break">让每一次调用都可配置、可追踪、可改进。</p><div class="auth-feature-list"><div>${studio.icon('agent', 20)}<p><strong>让智能体完成任务</strong><span>配置模型、工具和协作方式。</span></p></div><div>${studio.icon('workflow', 20)}<p><strong>把过程编排清楚</strong><span>从节点传参到分支执行，逐步调试。</span></p></div><div>${studio.icon('code', 20)}<p><strong>将能力提供给业务</strong><span>发布应用与 API，持续检查质量。</span></p></div></div><p class="auth-intro-note">你的内容，保存在当前浏览器。<br>账户之间使用独立工作空间。</p></aside><section class="auth-card" aria-labelledby="auth-heading"><div class="auth-card-heading"><p class="auth-step-label">${active === 'register' ? '创建你的工作空间' : active === 'forgot-password' || active === 'reset-password' ? '找回访问方式' : active === 'session-expired' ? '会话状态' : '欢迎回来'}</p><h1 id="auth-heading" tabindex="-1">${studio.escape(title)}</h1><p>${studio.escape(description)}</p></div>${content}</section></div><footer class="auth-footer"><span>OTRYX Studio</span><span>本地演示账户 · 不连接身份服务 · 不发送邮件</span></footer></div>`;
  }

  function loginPage() {
    const banner = flash ? `<div class="notice auth-flash" role="status">${studio.escape(flash)}</div>` : '';
    return layout('登录工作空间', '继续你的应用、工作流和运行记录。', `${banner}<form data-form="auth-login" class="auth-form" novalidate>${formError()}${field('邮箱', 'email', { type: 'email', autocomplete: 'username', value: resetEmail, placeholder: 'name@example.com' })}${field('密码', 'password', { type: 'password', autocomplete: 'current-password', placeholder: '输入你的密码' })}<div class="auth-form-options">${rememberField()}<a href="#forgot-password">忘记密码？</a></div>${submit('登录')}</form><p class="auth-switch">还没有账户？<a href="#register">创建本地账户</a></p><div class="auth-credential-demo" aria-label="演示账户"><div class="credential-row"><span class="credential-label">演示账号</span><strong>demo@peachagent.local</strong></div><div class="credential-row"><span class="credential-label">演示密码</span><strong>PeachAgent@2026</strong></div><button type="button" class="btn btn-ghost btn-sm" data-action="auth-fill-demo">填入演示账号</button></div><div class="auth-divider"><span>先了解产品</span></div>${studio.btn('进入演示空间', 'auth-demo', { variant: 'secondary', icon: 'play' })}<p class="auth-local-note">无需注册即可体验已有示例。新建账户会使用独立空间。</p>`, 'login');
  }

  function registerPage() {
    return layout('创建本地账户', '为你的应用建立一个独立的工作空间。', `<div class="notice auth-local-banner">账户仅保存在当前浏览器，不会创建真实云端账号。请使用演示密码，不要复用重要账户的密码。</div><form data-form="auth-register" class="auth-form" novalidate>${formError()}${field('你的称呼', 'name', { autocomplete: 'nickname', maxlength: 32, placeholder: '例如：小林' })}${field('邮箱', 'email', { type: 'email', autocomplete: 'username', placeholder: 'name@example.com' })}${field('设置密码', 'password', { type: 'password', autocomplete: 'new-password', placeholder: '至少 8 个字符', help: '支持粘贴及密码管理器，最多 128 个字符。' })}${field('确认密码', 'confirm', { type: 'password', autocomplete: 'new-password', placeholder: '再次输入密码' })}${submit('创建并进入工作空间')}</form><p class="auth-switch">已有本地账户？<a href="#login">返回登录</a></p><p class="auth-local-note">新账户不会继承其他账户或演示空间的修改。</p>`, 'register');
  }

  function forgotPage() {
    return layout('重置本地密码', '使用当前浏览器的演示流程重新设置密码。', `<div class="notice warning auth-local-banner"><strong>这是本地重置演示。</strong><br>不会发送邮件，也不能验证邮箱所有权。下一步会直接显示演示验证码；此浏览器的使用者均可操作，请勿用于真实账户。</div><form data-form="auth-forgot" class="auth-form" novalidate>${formError()}${field('注册邮箱', 'email', { type: 'email', autocomplete: 'username', value: resetEmail, placeholder: 'name@example.com' })}${submit('继续本地重置')}</form><p class="auth-switch"><a href="#login">返回登录</a></p>`, 'forgot-password');
  }

  function resetPage() {
    const current = resetChallenge();
    if (!current) return layout('重置已过期', '演示验证码只在当前页面会话中有效。刷新页面、超过 10 分钟或尝试过多后，需要重新开始。', `<div class="auth-state-icon">${studio.icon('clock', 25)}</div><a class="btn btn-primary auth-submit" href="#forgot-password">重新开始密码重置</a><p class="auth-switch"><a href="#login">返回登录</a></p>`, 'reset-password');
    return layout('设置新密码', '完成后，请使用新密码重新登录。', `<div class="auth-reset-demo"><div><strong>演示验证码</strong><span>仅在本页显示 · 10 分钟有效</span></div><output aria-label="当前演示验证码">${studio.escape(current.code)}</output><p>没有发送邮件。此流程不能验证 ${studio.escape(current.email)} 的所有权。</p></div><form data-form="auth-reset" class="auth-form" novalidate>${formError()}${field('演示验证码', 'code', { autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: 6, placeholder: '输入上方 6 位验证码' })}${field('新密码', 'password', { type: 'password', autocomplete: 'new-password', placeholder: '至少 8 个字符', help: '最多 128 个字符，支持粘贴及密码管理器。' })}${field('确认新密码', 'confirm', { type: 'password', autocomplete: 'new-password', placeholder: '再次输入新密码' })}${submit('更新本地密码')}</form><div class="auth-reset-actions">${studio.btn('重新生成演示码', 'auth-reset-regenerate', { variant: 'ghost', small: true })}<a href="#forgot-password">更换邮箱</a></div>`, 'reset-password');
  }

  function expiredPage() {
    return layout('登录状态已失效', '重新登录后，将返回刚才的页面。', `<div class="auth-session-message"><span class="auth-state-icon">${studio.icon('clock', 25)}</span><div><strong>已暂停当前浏览器中的执行</strong><p>已保存的内容和运行记录会保留。未保存的编辑请重新核对。</p></div></div><a class="btn btn-primary auth-submit" href="#login">重新登录</a>${studio.btn('进入演示空间', 'auth-demo', { variant: 'secondary', icon: 'play' })}<p class="auth-local-note">会话超过有效期、密码变更或本地账户记录更新，都可能需要重新登录。</p>`, 'session-expired');
  }

  function valuesOf(form) {
    const data = new FormData(form);
    return { name: data.get('name') || '', email: data.get('email') || '', password: data.get('password') || '', confirm: data.get('confirm') || '', code: data.get('code') || '', remember: data.get('remember') === 'on' };
  }

  function showError(form, error) {
    const fields = error.fields || {};
    let first = null;
    form.querySelectorAll('input').forEach(input => {
      const message = fields[input.name] || '';
      const line = form.querySelector('#' + input.id + '-error');
      if (line) line.textContent = message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message && !first) first = input;
    });
    const notice = form.querySelector('#auth-form-error');
    if (notice) { notice.hidden = false; notice.textContent = error.message || '操作未完成，请重试。'; }
    (first || notice)?.focus();
  }

  function clearPasswords(form) {
    form.querySelectorAll('input[name="password"],input[name="confirm"],input[name="code"]').forEach(input => { input.value = ''; });
  }

  async function runForm(form, operation, success) {
    if (form.dataset.authBusy === 'true') return;
    form.dataset.authBusy = 'true';
    const submitButton = form.querySelector('[type="submit"]');
    const original = submitButton?.innerHTML;
    if (submitButton) { submitButton.disabled = true; submitButton.setAttribute('aria-busy', 'true'); submitButton.innerHTML = '<span class="auth-loading-dot" aria-hidden="true"></span><span>正在处理…</span>'; }
    const notice = form.querySelector('#auth-form-error');
    if (notice) { notice.hidden = true; notice.textContent = ''; }
    try { const result = await operation(valuesOf(form)); clearPasswords(form); await success(result); }
    catch (error) {
      if (['credentials', 'reset-invalid'].includes(error.code)) clearPasswords(form);
      showError(form, error instanceof AuthError ? error : fail('unexpected', '操作未完成，请稍后重试。'));
    } finally {
      delete form.dataset.authBusy;
      if (submitButton) { submitButton.disabled = false; submitButton.removeAttribute('aria-busy'); submitButton.innerHTML = original; }
    }
  }

  function mountAuth(target) {
    const form = target.querySelector('form');
    const onInput = event => {
      if (!event.target.matches?.('input')) return;
      const field = event.target;
      const line = form?.querySelector('#' + field.id + '-error');
      if (line) line.textContent = '';
      field.removeAttribute('aria-invalid');
    };
    form?.addEventListener('input', onInput);
    return () => {
      form?.removeEventListener('input', onInput);
      if (form) clearPasswords(form);
      if (!String(location.hash).startsWith('#reset-password')) challenge = null;
    };
  }

  function attach(S) {
    if (studio === S) return;
    dispose();
    studio = S;
    S.Auth = api;
    const pages = [
      ['login', '登录', loginPage], ['register', '注册', registerPage],
      ['forgot-password', '忘记密码', forgotPage], ['reset-password', '重置密码', resetPage],
      ['session-expired', '登录已失效', expiredPage]
    ];
    pages.forEach(([route, title, render]) => S.page(route, { title, section: 'auth', render, mount: mountAuth }));
    S.action('auth-fill-demo', () => {
      const email=document.getElementById('auth-email'),password=document.getElementById('auth-password');
      if(email&&password){email.value='demo@peachagent.local';password.value='PeachAgent@2026';email.dispatchEvent(new Event('input',{bubbles:true}));password.dispatchEvent(new Event('input',{bubbles:true}));S.toast('已填入本地演示账号');}
    });
    S.action('auth-demo', async () => {
      try { enterDemo(); } catch (error) {
        S.modal({ title: '暂时无法进入演示', body: `<div class="notice error">${S.escape(error.message)}</div>`, footer: S.btn('返回', 'modal-close', { variant: 'secondary' }) });
      }
    });
    S.action('auth-toggle-password', el => {
      const input = document.getElementById(el.dataset.input);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.setAttribute('aria-pressed', String(show));
      const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.replace('*', '') || '密码';
      el.setAttribute('aria-label', (show ? '隐藏' : '显示') + label);
      el.innerHTML = S.icon('eye', 17) + '<span>' + (show ? '隐藏' : '显示') + '</span>';
    });
    S.action('auth-logout', () => logout());
    S.action('auth-confirm-logout', () => logout({ force: true }));
    S.action('auth-account', openAccount);
    S.action('auth-reset-regenerate', () => {
      try { beginReset(resetEmail); S.render(); }
      catch (error) { const form = document.querySelector('[data-form="auth-reset"]'); if (form) showError(form, error); else S.toast(error.message, 'error'); }
    });
    S.form('auth-login', form => runForm(form, signIn, resume));
    S.form('auth-register', form => runForm(form, createAccount, resume));
    S.form('auth-forgot', form => runForm(form, values => beginReset(values.email), () => S.go('reset-password')));
    S.form('auth-reset', form => runForm(form, resetPassword, () => S.go('login')));
    watchedSession = getSession();
    expiryTimer = setInterval(watchSession, 15000);
    expiryTimer?.unref?.();
    window.addEventListener('focus', watchSession);
    window.addEventListener('storage', watchSession);
  }

  function dispose() {
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
    window.removeEventListener?.('focus', watchSession);
    window.removeEventListener?.('storage', watchSession);
  }

  const api = window.StudioAuth = {
    attach, dispose, getSession, workspaceStorageKey, guard, isAuthRoute, safeReturnHash,
    createAccount, signIn, enterDemo, beginReset, resetChallenge, resetPassword,
    logout, expire, openAccount, resume, stopWorkspace,
    constants: Object.freeze({ ACCOUNT_KEY, SESSION_KEY, REMEMBER_KEY, RETURN_KEY, LEGACY_WORKSPACE, SESSION_TTL, REMEMBER_TTL, RESET_TTL })
  };
})();
