import {
  DM_STORAGE_KEY,
  GAS_MESSAGES_ENDPOINT,
  GLOBAL_CHANNEL,
  GLOBAL_STORAGE_KEY,
  MESSAGE_MAX_EMOJI,
  MESSAGE_TTL_MS,
  PASSWORD_HASH,
} from '../constants.js';
import { rememberPeer } from '../state/peers.js';
import { countGraphemes, isEmojiOnly } from '../logic/emoji-guards.js';

const hasRemoteEndpoint = Boolean(GAS_MESSAGES_ENDPOINT);
const sharedPassPayload = PASSWORD_HASH ? { shared_pass_hash: PASSWORD_HASH } : {};

function readLocalMessages(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch (error) {
    console.warn('Failed to parse stored messages, clearing.', error);
    localStorage.removeItem(storageKey);
    return [];
  }
}

function writeLocalMessages(storageKey, messages) {
  localStorage.setItem(storageKey, JSON.stringify(messages));
}

function pruneOldMessages(messages) {
  const now = Date.now();
  const filtered = messages.filter((msg) => {
    const createdAt = new Date(msg.created_at).getTime();
    return now - createdAt <= MESSAGE_TTL_MS;
  });
  return filtered;
}

function readAndPrune(storageKey) {
  const messages = readLocalMessages(storageKey);
  const filtered = pruneOldMessages(messages);
  if (filtered.length !== messages.length) {
    writeLocalMessages(storageKey, filtered);
  }
  return filtered;
}

function normalizeMessage(message) {
  return {
    id: message.id,
    sender_id: message.sender_id,
    receiver_id: message.receiver_id,
    content: message.content,
    created_at: message.created_at,
    channel: message.channel || 'dm',
  };
}

function appendSharedPass(url) {
  if (!PASSWORD_HASH) return;
  url.searchParams.set('shared_pass_hash', PASSWORD_HASH);
}

export async function fetchConversation(userId, peerId) {
  if (!peerId) return [];
  if (hasRemoteEndpoint) {
    const url = new URL(GAS_MESSAGES_ENDPOINT);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('peer_id', peerId);
    appendSharedPass(url);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'text/plain' },
      // CORS は GAS 側のレスポンスヘッダーで許可されるため、
      // Access-Control-Allow-* 系のリクエストヘッダーは不要。
      mode: 'cors',
    });
    if (!response.ok) {
      throw new Error('メッセージ取得に失敗しました');
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return data.map(normalizeMessage);
  }

  const allMessages = readAndPrune(DM_STORAGE_KEY);
  const filtered = allMessages
    .filter((msg) => {
      return (
        (msg.sender_id === userId && msg.receiver_id === peerId) ||
        (msg.sender_id === peerId && msg.receiver_id === userId)
      );
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return filtered.map(normalizeMessage);
}

export async function sendMessage({ sender_id, receiver_id, content }) {
  if (!sender_id || !receiver_id) {
    throw new Error('送信者と受信者を指定してください');
  }
  if (!content || !content.trim()) {
    throw new Error('メッセージを入力してください');
  }

  if (hasRemoteEndpoint) {
    const body = JSON.stringify({ sender_id, receiver_id, content, ...sharedPassPayload });
    const response = await fetch(GAS_MESSAGES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      mode: 'cors',
      // text/plain で送ってもボディは JSON として扱う
      body,
    });
    if (!response.ok) {
      throw new Error('メッセージ送信に失敗しました');
    }
    const data = await response.json();
    rememberPeer(sender_id, receiver_id, content);
    return data;
  }

  const messages = readAndPrune(DM_STORAGE_KEY);
  const newMessage = {
    id: `local-${Date.now()}`,
    sender_id,
    receiver_id,
    content,
    created_at: new Date().toISOString(),
    channel: 'dm',
  };
  messages.push(newMessage);
  writeLocalMessages(DM_STORAGE_KEY, messages);
  rememberPeer(sender_id, receiver_id, content);
  return newMessage;
}

export async function fetchGlobalFeed() {
  if (hasRemoteEndpoint) {
    const url = new URL(GAS_MESSAGES_ENDPOINT);
    url.searchParams.set('channel', GLOBAL_CHANNEL);
    appendSharedPass(url);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'text/plain' },
      // CORS は GAS 側のレスポンスヘッダーで許可されるため、
      // Access-Control-Allow-* 系のリクエストヘッダーは不要。
      mode: 'cors',
    });
    if (!response.ok) {
      throw new Error('全体チャットの取得に失敗しました');
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return data.map((message) => normalizeMessage({ ...message, channel: GLOBAL_CHANNEL }));
  }

  const messages = readAndPrune(GLOBAL_STORAGE_KEY)
    .filter((msg) => (msg.channel || GLOBAL_CHANNEL) === GLOBAL_CHANNEL)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return messages.map((message) => normalizeMessage({ ...message, channel: GLOBAL_CHANNEL }));
}

export async function sendGlobalMessage({ sender_id, content }) {
  if (!sender_id) {
    throw new Error('送信者を指定してください');
  }
  if (!content || !isEmojiOnly(content)) {
    throw new Error('全体チャットは絵文字のみで投稿してください');
  }
  if (countGraphemes(content) > MESSAGE_MAX_EMOJI) {
    throw new Error(`全体チャットは${MESSAGE_MAX_EMOJI}個までです`);
  }

  if (hasRemoteEndpoint) {
    const body = JSON.stringify({ sender_id, content, channel: GLOBAL_CHANNEL, ...sharedPassPayload });
    const response = await fetch(GAS_MESSAGES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      mode: 'cors',
      body,
    });
    if (!response.ok) {
      throw new Error('全体チャットの送信に失敗しました');
    }
    return response.json();
  }

  const messages = readAndPrune(GLOBAL_STORAGE_KEY);
  const newMessage = {
    id: `global-${Date.now()}`,
    sender_id,
    receiver_id: GLOBAL_CHANNEL,
    content,
    created_at: new Date().toISOString(),
    channel: GLOBAL_CHANNEL,
  };
  messages.push(newMessage);
  writeLocalMessages(GLOBAL_STORAGE_KEY, messages);
  return newMessage;
}
