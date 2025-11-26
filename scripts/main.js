import { accentForRole, formatTimestamp } from './logic/responders.js';
import { countGraphemes, isEmojiOnly } from './logic/emoji-guards.js';
import { hashText } from './utils/crypto.js';
import { deleteCookie, getCookie, setCookie } from './utils/cookies.js';
import {
  COOKIE_MAX_AGE_DAYS,
  COOKIE_NAME,
  DM_MAX_CHARS,
  MESSAGE_MAX_EMOJI,
  PASSWORD_HASH,
  POLL_INTERVAL_MS,
  EMOJI_PALETTE,
} from './constants.js';
import { loadProfile } from './state/profile.js';
import { listPeers, rememberPeer, syncPeersFromMessages } from './state/peers.js';
import {
  fetchConversation,
  fetchGlobalFeed,
  sendGlobalMessage,
  sendMessage,
} from './services/api.js';

const app = document.querySelector('#app');
const query = new URLSearchParams(window.location.search);
const initialPeer = query.get('peer_id');

const state = {
  authenticated: false,
  profile: loadProfile(),
  view: 'login',
  tab: initialPeer ? 'dm' : 'global',
  currentPeerId: initialPeer,
  loginError: '',
  loginBusy: false,
  globalMessages: [],
  globalStatus: 'idle',
  globalError: '',
  globalComposerValue: '',
  globalComposerError: '',
  globalComposerTouched: false,
  globalSending: false,
  dmMessages: [],
  dmStatus: 'idle',
  dmError: '',
  dmComposerValue: '',
  dmComposerError: '',
  dmComposerTouched: false,
  dmSending: false,
};

let dmPollerId = null;
let globalPollerId = null;

function init() {
  const cookie = getCookie(COOKIE_NAME);
  state.authenticated = cookie === PASSWORD_HASH;
  state.view = state.authenticated
    ? state.tab === 'global'
      ? 'global'
      : state.currentPeerId
        ? 'dm-chat'
        : 'dm-home'
    : 'login';
  render();
  if (!state.authenticated) {
    return;
  }
  if (state.tab === 'global') {
    enterGlobalTab();
  } else if (state.currentPeerId) {
    enterChat(state.currentPeerId);
  }
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function stopDmPolling() {
  if (dmPollerId) {
    clearInterval(dmPollerId);
    dmPollerId = null;
  }
}

function stopGlobalPolling() {
  if (globalPollerId) {
    clearInterval(globalPollerId);
    globalPollerId = null;
  }
}

function startDmPolling(peerId) {
  stopDmPolling();
  if (!peerId) return;
  dmPollerId = setInterval(() => {
    loadConversation(peerId, { silent: true });
  }, POLL_INTERVAL_MS);
}

function startGlobalPolling() {
  stopGlobalPolling();
  globalPollerId = setInterval(() => {
    loadGlobalFeed({ silent: true });
  }, POLL_INTERVAL_MS);
}

async function loadConversation(peerId, { silent = false } = {}) {
  if (!peerId) return;
  if (!silent) {
    setState({ dmStatus: 'loading', dmError: '' });
  }
  try {
    const messages = await fetchConversation(state.profile.userId, peerId);
    syncPeersFromMessages(state.profile.userId, messages);
    setState({ dmMessages: messages, dmStatus: 'ready', dmError: '' });
    scrollConversationToEnd('[data-dm-conversation]');
  } catch (error) {
    setState({ dmStatus: 'error', dmError: error.message || 'メッセージ取得に失敗しました' });
  }
}

async function loadGlobalFeed({ silent = false } = {}) {
  if (!silent) {
    setState({ globalStatus: 'loading', globalError: '' });
  }
  try {
    const messages = await fetchGlobalFeed();
    setState({ globalMessages: messages, globalStatus: 'ready', globalError: '' });
    scrollConversationToEnd('[data-global-conversation]');
  } catch (error) {
    setState({ globalStatus: 'error', globalError: error.message || '全体チャットの取得に失敗しました' });
  }
}

function resolveAuthenticatedView() {
  return state.tab === 'global' ? 'global' : state.currentPeerId ? 'dm-chat' : 'dm-home';
}

async function handleLogin(form) {
  const passwordInput = form.querySelector('[data-password-input]');
  const password = passwordInput.value;
  if (!password) {
    setState({ loginError: 'パスワードを入力してください。' });
    return;
  }
  setState({ loginBusy: true, loginError: '' });
  try {
    const hash = await hashText(password);
    if (hash === PASSWORD_HASH) {
      setCookie(COOKIE_NAME, hash, COOKIE_MAX_AGE_DAYS);
      state.authenticated = true;
      state.loginError = '';
      state.loginBusy = false;
      state.view = resolveAuthenticatedView();
      render();
      if (state.tab === 'global') {
        enterGlobalTab();
      } else if (state.currentPeerId) {
        enterChat(state.currentPeerId);
      }
    } else {
      setState({ loginError: 'パスワードが違います。', loginBusy: false });
    }
  } catch (error) {
    console.error(error);
    setState({ loginError: 'ハッシュ計算に失敗しました。', loginBusy: false });
  }
}

function handleLogout() {
  deleteCookie(COOKIE_NAME);
  stopDmPolling();
  stopGlobalPolling();
  setState({
    authenticated: false,
    view: 'login',
    tab: 'global',
    currentPeerId: null,
    globalMessages: [],
    dmMessages: [],
    globalComposerValue: '',
    dmComposerValue: '',
    globalComposerError: '',
    globalComposerTouched: false,
    dmComposerTouched: false,
    dmComposerError: '',
  });
}

function switchTab(tab) {
  if (state.tab === tab) return;
  if (tab === 'global') {
    enterGlobalTab();
    return;
  }
  stopGlobalPolling();
  state.tab = 'dm';
  state.view = state.currentPeerId ? 'dm-chat' : 'dm-home';
  render();
  if (state.currentPeerId) {
    enterChat(state.currentPeerId);
  }
}

function enterGlobalTab() {
  stopDmPolling();
  state.tab = 'global';
  state.view = 'global';
  render();
  loadGlobalFeed();
  startGlobalPolling();
}

function goHome() {
  stopDmPolling();
  setState({
    view: 'dm-home',
    tab: 'dm',
    currentPeerId: null,
    dmMessages: [],
    dmComposerValue: '',
    dmComposerTouched: false,
    dmComposerError: '',
  });
}

function enterChat(peerId) {
  stopGlobalPolling();
  rememberPeer(state.profile.userId, peerId, '');
  setState({
    currentPeerId: peerId,
    view: 'dm-chat',
    tab: 'dm',
    dmMessages: [],
    dmComposerValue: '',
    dmComposerTouched: false,
    dmComposerError: '',
  });
  loadConversation(peerId);
  startDmPolling(peerId);
}

function validateGlobalComposer(value) {
  if (!value) {
    return '';
  }
  if (!isEmojiOnly(value)) {
    return '絵文字以外が含まれています';
  }
  if (countGraphemes(value) > MESSAGE_MAX_EMOJI) {
    return `1メッセージは${MESSAGE_MAX_EMOJI}個までです`;
  }
  return '';
}

function validateDmComposer(value) {
  if (!value.trim()) {
    return 'メッセージを入力してください';
  }
  if (value.length > DM_MAX_CHARS) {
    return `DMは${DM_MAX_CHARS}文字までです`;
  }
  return '';
}

function getComposerKeys(scope) {
  if (scope === 'global') {
    return {
      valueKey: 'globalComposerValue',
      errorKey: 'globalComposerError',
      touchedKey: 'globalComposerTouched',
      sendingKey: 'globalSending',
      formSelector: '[data-global-form]',
      inputSelector: '[data-global-input]',
    };
  }
  return {
    valueKey: 'dmComposerValue',
    errorKey: 'dmComposerError',
    touchedKey: 'dmComposerTouched',
    sendingKey: 'dmSending',
    formSelector: '[data-dm-form]',
    inputSelector: '[data-dm-input]',
  };
}

function renderEmojiPalette(scope) {
  return `
    <div class="emoji-palette" data-emoji-palette="${scope}">
      <p class="emoji-palette__label">絵文字パレット</p>
      <div class="emoji-palette__grid">
        ${EMOJI_PALETTE.map(
          (emoji) =>
            `<button type="button" class="emoji-chip" data-emoji="${emoji}" aria-label="${emoji} を挿入">${emoji}</button>`,
        ).join('')}
      </div>
    </div>
  `;
}

function renderComposerError(scope) {
  const { errorKey } = getComposerKeys(scope);
  const message = state[errorKey] || '';
  const hiddenClass = message ? '' : ' is-hidden';
  return `<p class="error${hiddenClass}" data-${scope}-error aria-live="polite">${message}</p>`;
}

function syncComposerUI(scope, inputEl) {
  const { valueKey, errorKey, sendingKey, formSelector } = getComposerKeys(scope);
  const error = state[errorKey] || '';
  const value = state[valueKey] || '';
  const form = app.querySelector(formSelector);
  const submitButton = form ? form.querySelector('button[type="submit"]') : null;
  if (submitButton) {
    submitButton.disabled = Boolean(error) || !value || state[sendingKey];
  }
  const errorEl = app.querySelector(`[data-${scope}-error]`);
  if (errorEl) {
    errorEl.textContent = messageOrSpace(error);
    errorEl.classList.toggle('is-hidden', !error);
  }
  if (inputEl) {
    if (error) {
      inputEl.setAttribute('aria-invalid', 'true');
    } else {
      inputEl.removeAttribute('aria-invalid');
    }
  }
}

function messageOrSpace(text) {
  return text || ' ';
}

function validateComposer(scope, value) {
  return scope === 'global' ? validateGlobalComposer(value) : validateDmComposer(value);
}

function bindEmojiPalette(scope) {
  const keys = getComposerKeys(scope);
  const palette = app.querySelector(`[data-emoji-palette="${scope}"]`);
  const form = app.querySelector(keys.formSelector);
  const input = form ? form.querySelector(keys.inputSelector) : null;
  if (!palette || !input) return;
  palette.addEventListener('click', (event) => {
    const emojiButton = event.target.closest('[data-emoji]');
    if (!emojiButton) return;
    const emoji = emojiButton.getAttribute('data-emoji');
    if (!emoji) return;
    const newValue = `${input.value || ''}${emoji}`;
    state[keys.valueKey] = newValue;
    input.value = newValue;
    if (state[keys.touchedKey]) {
      state[keys.errorKey] = validateComposer(scope, newValue);
    }
    syncComposerUI(scope, input);
    input.focus();
  });
}

async function handleGlobalSend(form) {
  const input = form.querySelector('[data-global-input]');
  const message = input ? input.value : state.globalComposerValue;
  state.globalComposerValue = message;
  state.globalComposerTouched = true;
  const error = validateGlobalComposer(message);
  state.globalComposerError = error;
  syncComposerUI('global', input);
  if (error) {
    return;
  }
  setState({ globalSending: true, globalComposerError: '', globalComposerTouched: true });
  try {
    await sendGlobalMessage({ sender_id: state.profile.userId, content: message });
    setState({
      globalComposerValue: '',
      globalSending: false,
      globalComposerError: '',
      globalComposerTouched: false,
    });
    await loadGlobalFeed({ silent: true });
    scrollConversationToEnd('[data-global-conversation]');
  } catch (err) {
    setState({
      globalComposerError: err.message || '送信に失敗しました',
      globalSending: false,
      globalComposerTouched: true,
    });
  }
}

async function handleDmSend(form) {
  const input = form.querySelector('[data-dm-input]');
  const message = input ? input.value : state.dmComposerValue;
  state.dmComposerValue = message;
  state.dmComposerTouched = true;
  const error = validateDmComposer(message);
  state.dmComposerError = error;
  syncComposerUI('dm', input);
  if (error) {
    return;
  }
  setState({ dmSending: true, dmComposerError: '', dmComposerTouched: true });
  try {
    await sendMessage({
      sender_id: state.profile.userId,
      receiver_id: state.currentPeerId,
      content: message,
    });
    setState({
      dmComposerValue: '',
      dmSending: false,
      dmComposerError: '',
      dmComposerTouched: false,
    });
    await loadConversation(state.currentPeerId, { silent: true });
    scrollConversationToEnd('[data-dm-conversation]');
  } catch (err) {
    setState({
      dmComposerError: err.message || '送信に失敗しました',
      dmSending: false,
      dmComposerTouched: true,
    });
  }
}

function copyUserId(button) {
  const { userId } = state.profile;
  navigator.clipboard.writeText(userId).then(() => {
    button.textContent = 'コピー済み ✅';
    setTimeout(() => {
      button.textContent = 'コピー';
    }, 2000);
  });
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      <div class="app-card">
        ${renderHeader()}
        ${state.authenticated ? renderDashboard() : renderLoginGate()}
      </div>
    </div>
  `;
  bindEvents();
  if (state.view === 'dm-chat') {
    scrollConversationToEnd('[data-dm-conversation]');
  }
  if (state.view === 'global') {
    scrollConversationToEnd('[data-global-conversation]');
  }
}

function renderHeader() {
  return `
    <header class="hero">
      <p class="hero-label">emoji lounge</p>
      <h1 class="hero-title">全体チャットで絵文字を共有、DMで深掘り</h1>
      <p class="hero-subtitle">
        合言葉で入室し、ロビーでは絵文字のみ。DMに切り替えると文章でも相談できます。
      </p>
    </header>
  `;
}

function renderLoginGate() {
  return `
    <section class="panel">
      <h2>合言葉でロック解除</h2>
      <p class="panel-subtext">仲間内で共有したパスワードを入力してください。</p>
      <form data-login-form class="form-grid">
        <label class="form-field">
          <span>共通パスワード</span>
          <input type="password" data-password-input placeholder="emoji-friends" />
        </label>
        <button type="submit" class="primary" ${state.loginBusy ? 'disabled' : ''}>
          ${state.loginBusy ? '確認中…' : '入室する'}
        </button>
        ${state.loginError ? `<p class="error">${state.loginError}</p>` : ''}
      </form>
    </section>
  `;
}

function renderTabs() {
  if (!state.authenticated) return '';
  return `
    <div class="tab-switch">
      <button type="button" data-tab="global" class="tab ${state.tab === 'global' ? 'is-active' : ''}">
        全体チャット
      </button>
      <button type="button" data-tab="dm" class="tab ${state.tab === 'dm' ? 'is-active' : ''}">
        DM
      </button>
    </div>
  `;
}

function renderDashboard() {
  return `
    ${renderTabs()}
    ${state.view === 'global' ? renderGlobalView() : state.view === 'dm-chat' ? renderChatView() : renderHomeView()}
  `;
}

function renderProfileCard() {
  const { userId, displayName, iconEmoji } = state.profile;
  return `
    <div class="profile-card">
      <div class="profile-icon">${iconEmoji}</div>
      <div>
        <p class="label">あなたのID</p>
        <p class="user-id">${userId}</p>
        <p class="display-name">${displayName}</p>
      </div>
      <button type="button" data-copy-id class="ghost">コピー</button>
    </div>
  `;
}

function renderPeers() {
  const peers = listPeers(state.profile.userId);
  if (peers.length === 0) {
    return '<p class="empty">まだDMはありません。IDを共有して始めましょう。</p>';
  }
  return `
    <ul class="peer-list">
      ${peers
        .map(
          (peer) => `
            <li>
              <button type="button" data-peer-entry="${peer.peerId}">
                <div>
                  <p class="peer-id">${peer.peerId}</p>
                  <p class="peer-last">${peer.lastMessage || '最近のメッセージなし'}</p>
                </div>
                <span class="peer-updated">${formatTimestamp(new Date(peer.updatedAt))}</span>
              </button>
            </li>
          `,
        )
        .join('')}
    </ul>
  `;
}

function renderHomeView() {
  return `
    <section class="panel">
      ${renderProfileCard()}
      <div class="divider"></div>
      <div class="dm-start">
        <h2>新しいDMを開始</h2>
        <form data-peer-form class="form-grid">
          <label class="form-field">
            <span>相手のユーザーID</span>
            <input type="text" data-peer-input placeholder="uuidを貼り付け" value="" />
          </label>
          <button type="submit" class="primary">DMを開く</button>
        </form>
      </div>
      <div class="divider"></div>
      <div>
        <h2>最近のDM</h2>
        ${renderPeers()}
      </div>
      <button type="button" class="ghost" data-logout>ログアウト</button>
    </section>
  `;
}

function renderStatusBanner(status, error) {
  if (status === 'loading') {
    return '<p class="status">更新中…</p>';
  }
  if (status === 'error') {
    return `<p class="status error">${error}</p>`;
  }
  return '';
}

function renderMessages(messages, { emptyText, mode } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return `<p class="empty">${emptyText}</p>`;
  }
  const { userId } = state.profile;
  return messages
    .map((msg) => {
      const mine = msg.sender_id === userId;
      const timestamp = formatTimestamp(new Date(msg.created_at));
      const role = mine ? 'you' : 'designer';
      const accent = accentForRole(role);
      const tagLabel = mode === 'global' ? (mine ? 'あなた' : msg.sender_id) : mine ? 'あなた' : '相手';
      return `
        <article class="bubble ${mine ? 'bubble--me' : 'bubble--peer'}">
          <div class="bubble-meta">
            <span class="tag ${accent}">${tagLabel}</span>
            <span class="bubble-time">${timestamp}</span>
          </div>
          <p class="bubble-text">${msg.content}</p>
        </article>
      `;
    })
    .join('');
}

function renderGlobalView() {
  const sendDisabled =
    state.globalSending || !state.globalComposerValue || Boolean(state.globalComposerError);
  return `
    <section class="panel chat-panel">
      <div class="chat-header">
        <div>
          <p class="label">全体チャット</p>
          <p class="peer-id">みんなで最大${MESSAGE_MAX_EMOJI}個の絵文字を共有</p>
        </div>
        <button type="button" class="ghost" data-logout>ログアウト</button>
      </div>
      ${renderStatusBanner(state.globalStatus, state.globalError)}
      <div class="conversation" data-global-conversation>
        ${renderMessages(state.globalMessages, {
          emptyText: '最初の絵文字を投稿してロビーを賑やかにしましょう。',
          mode: 'global',
        })}
      </div>
      <form data-global-form class="composer">
        <label class="form-field">
          <span>絵文字のみ（最大${MESSAGE_MAX_EMOJI}）</span>
          <input
            type="text"
            data-global-input
            placeholder="🌞🌈💬"
            value="${state.globalComposerValue}"
            autocomplete="off"
          />
          ${renderEmojiPalette('global')}
        </label>
        <button type="submit" class="primary" ${sendDisabled ? 'disabled' : ''}>
          ${state.globalSending ? '送信中…' : '投稿'}
        </button>
      </form>
      ${renderComposerError('global')}
    </section>
  `;
}

function renderChatView() {
  const sendDisabled = state.dmSending || !state.dmComposerValue || Boolean(state.dmComposerError);
  return `
    <section class="panel chat-panel">
      <div class="chat-header">
        <button type="button" class="ghost" data-back-home>← DM一覧</button>
        <div class="peer-summary">
          <p class="label">相手のID</p>
          <p class="peer-id">${state.currentPeerId}</p>
        </div>
        <button type="button" class="ghost" data-logout>ログアウト</button>
      </div>
      ${renderStatusBanner(state.dmStatus, state.dmError)}
      <div class="conversation" data-dm-conversation>
        ${renderMessages(state.dmMessages, {
          emptyText: 'メッセージはまだありません。最初の一言を送ってみましょう。',
          mode: 'dm',
        })}
      </div>
      <form data-dm-form class="composer">
        <label class="form-field">
          <span>テキストで送信（最大${DM_MAX_CHARS}文字）</span>
          <textarea
            data-dm-input
            placeholder="こんにちは！"
            rows="2"
            autocomplete="off"
          >${state.dmComposerValue}</textarea>
          ${renderEmojiPalette('dm')}
        </label>
        <button type="submit" class="primary" ${sendDisabled ? 'disabled' : ''}>
          ${state.dmSending ? '送信中…' : '送信'}
        </button>
      </form>
      ${renderComposerError('dm')}
    </section>
  `;
}

function bindEvents() {
  const loginForm = app.querySelector('[data-login-form]');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleLogin(loginForm);
    });
  }

  const copyButton = app.querySelector('[data-copy-id]');
  if (copyButton) {
    copyButton.addEventListener('click', () => copyUserId(copyButton));
  }

  const peerForm = app.querySelector('[data-peer-form]');
  if (peerForm) {
    peerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = peerForm.querySelector('[data-peer-input]');
      const peerId = input.value.trim();
      if (!peerId) {
        input.setCustomValidity('ユーザーIDを入力してください');
        input.reportValidity();
        return;
      }
      input.value = '';
      enterChat(peerId);
    });
  }

  const peerButtons = app.querySelectorAll('[data-peer-entry]');
  peerButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const peerId = button.getAttribute('data-peer-entry');
      enterChat(peerId);
    });
  });

  const logoutButtons = app.querySelectorAll('[data-logout]');
  logoutButtons.forEach((button) => {
    button.addEventListener('click', handleLogout);
  });

  const backButton = app.querySelector('[data-back-home]');
  if (backButton) {
    backButton.addEventListener('click', goHome);
  }

  const dmForm = app.querySelector('[data-dm-form]');
  if (dmForm) {
    const input = dmForm.querySelector('[data-dm-input]');
    input.addEventListener('input', () => {
      const value = input.value;
      state.dmComposerValue = value;
      if (state.dmComposerTouched) {
        state.dmComposerError = validateDmComposer(value);
      }
      syncComposerUI('dm', input);
    });
    input.addEventListener('blur', () => {
      state.dmComposerTouched = true;
      state.dmComposerError = validateDmComposer(input.value);
      syncComposerUI('dm', input);
    });
    dmForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleDmSend(dmForm);
    });
    bindEmojiPalette('dm');
  }

  const globalForm = app.querySelector('[data-global-form]');
  if (globalForm) {
    const input = globalForm.querySelector('[data-global-input]');
    input.addEventListener('input', () => {
      const value = input.value;
      state.globalComposerValue = value;
      if (state.globalComposerTouched) {
        state.globalComposerError = validateGlobalComposer(value);
      }
      syncComposerUI('global', input);
    });
    input.addEventListener('blur', () => {
      state.globalComposerTouched = true;
      state.globalComposerError = validateGlobalComposer(input.value);
      syncComposerUI('global', input);
    });
    globalForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleGlobalSend(globalForm);
    });
    bindEmojiPalette('global');
  }

  const tabButtons = app.querySelectorAll('[data-tab]');
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab');
      switchTab(tab);
    });
  });
}

function scrollConversationToEnd(selector) {
  const scroller = app.querySelector(selector);
  if (scroller) {
    scroller.scrollTop = scroller.scrollHeight;
  }
}

init();
