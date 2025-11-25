const emojiPattern = /\p{Extended_Pictographic}/u;
const skinToneRange = [0x1f3fb, 0x1f3ff];

export function isEmojiOnly(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const segments = Array.from(value);
  for (const segment of segments) {
    const code = segment.codePointAt(0);
    const isSkinTone = code >= skinToneRange[0] && code <= skinToneRange[1];
    if (
      segment === '\u200d' ||
      segment === '\ufe0f' ||
      isSkinTone ||
      emojiPattern.test(segment)
    ) {
      continue;
    }
    return false;
  }

  return segments.some((segment) => emojiPattern.test(segment));
}

export function countGraphemes(text) {
  if (!text) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text)).length;
  }
  return Array.from(text).length;
}
