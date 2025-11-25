import { PROFILE_STORAGE_KEY } from '../constants.js';

const fallbackIcons = ['🦊', '🐼', '🦉', '🦋', '🐙', '🐚', '🌸', '🌙'];

function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createProfile() {
  const iconEmoji = fallbackIcons[Math.floor(Math.random() * fallbackIcons.length)];
  const profile = {
    userId: generateId(),
    displayName: `Emoji Ranger ${iconEmoji}`,
    iconEmoji,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return createProfile();
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.userId) {
      return parsed;
    }
    return createProfile();
  } catch (error) {
    console.warn('Failed to parse profile, regenerating.', error);
    return createProfile();
  }
}

export function updateProfile(patch) {
  const current = loadProfile();
  const next = { ...current, ...patch };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
}
