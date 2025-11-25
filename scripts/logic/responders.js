const keywordEmojis = [
  { pattern: /coffee|latte|espresso/i, emoji: '☕️💬' },
  { pattern: /party|celebrate|friday/i, emoji: '🎉🥳' },
  { pattern: /ship|deploy|launch/i, emoji: '🚀✨' },
  { pattern: /sun|morning|day/i, emoji: '🌞🌈' },
  { pattern: /moon|night|sleep/i, emoji: '🌙💤' },
  { pattern: /idea|brainstorm|plan/i, emoji: '💡🧠' },
  { pattern: /love|heart/i, emoji: '❤️😊' },
  { pattern: /pizza|taco|sushi|snack/i, emoji: '🍕🌮🍣' },
  { pattern: /rain|storm/i, emoji: '🌧️☔️' },
  { pattern: /urgent|asap/i, emoji: '⏰⚡️' },
];

const moodFallbacks = {
  bright: '✨😊',
  mellow: '🌊😌',
  hype: '⚡️🔥',
  chill: '🫧😴',
};

export function emojiEcho(text, mood = 'bright') {
  if (!text || typeof text !== 'string') {
    return '✨';
  }

  const matches = keywordEmojis
    .filter(({ pattern }) => pattern.test(text))
    .map(({ emoji }) => emoji);

  if (matches.length > 0) {
    return matches.join(' ');
  }

  return moodFallbacks[mood] || moodFallbacks.bright;
}

export function formatTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  });

  return formatter.format(date);
}

export function accentForRole(role) {
  switch (role) {
    case 'designer':
      return 'accent-sunrise';
    case 'pm':
      return 'accent-mint';
    case 'engineer':
      return 'accent-lilac';
    case 'you':
      return 'accent-peach';
    case 'bot':
      return 'accent-gold';
    default:
      return 'accent-slate';
  }
}
