import { PEER_STORAGE_KEY } from '../constants.js';

function loadPeerMap() {
  try {
    const raw = localStorage.getItem(PEER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed || {};
  } catch (error) {
    console.warn('Failed to parse peer cache, resetting.', error);
    return {};
  }
}

function savePeerMap(map) {
  localStorage.setItem(PEER_STORAGE_KEY, JSON.stringify(map));
}

export function listPeers(userId) {
  const map = loadPeerMap();
  const peers = map[userId] || [];
  return [...peers].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function rememberPeer(userId, peerId, lastMessage) {
  if (!userId || !peerId) return;
  const map = loadPeerMap();
  const current = map[userId] || [];
  const existing = current.find((entry) => entry.peerId === peerId);
  const now = new Date().toISOString();
  if (existing) {
    existing.updatedAt = now;
    if (lastMessage) {
      existing.lastMessage = lastMessage;
    }
  } else {
    current.push({ peerId, lastMessage: lastMessage || '', updatedAt: now });
  }
  map[userId] = current;
  savePeerMap(map);
}

export function syncPeersFromMessages(userId, messages) {
  if (!Array.isArray(messages)) return;
  const map = loadPeerMap();
  const current = map[userId] || [];

  const updateEntry = (peerId, lastMessage, updatedAt) => {
    if (!peerId) return;
    const entry = current.find((item) => item.peerId === peerId);
    if (entry) {
      if (new Date(updatedAt).getTime() > new Date(entry.updatedAt).getTime()) {
        entry.updatedAt = updatedAt;
        entry.lastMessage = lastMessage;
      }
    } else {
      current.push({ peerId, lastMessage, updatedAt });
    }
  };

  messages.forEach((msg) => {
    const peerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    updateEntry(peerId, msg.content, msg.created_at);
  });

  map[userId] = current;
  savePeerMap(map);
}
