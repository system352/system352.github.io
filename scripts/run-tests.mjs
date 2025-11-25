import assert from 'node:assert/strict';
import { accentForRole, emojiEcho, formatTimestamp } from './logic/responders.js';
import { countGraphemes, isEmojiOnly } from './logic/emoji-guards.js';

const tests = [
  {
    name: 'emojiEcho combines multiple keyword reactions',
    run: () => {
      const reaction = emojiEcho('ship the build and then party to celebrate!');
      assert.equal(reaction, '🎉🥳 🚀✨');
    },
  },
  {
    name: 'emojiEcho falls back to mood when no keywords hit',
    run: () => {
      const reaction = emojiEcho('calm zigzag walk', 'mellow');
      assert.equal(reaction, '🌊😌');
    },
  },
  {
    name: 'formatTimestamp always formats in JST',
    run: () => {
      const date = new Date(Date.UTC(2023, 0, 1, 0, 5));
      assert.equal(formatTimestamp(date), '09:05');
    },
  },
  {
    name: 'accentForRole returns themed tokens',
    run: () => {
      assert.equal(accentForRole('you'), 'accent-peach');
      assert.equal(accentForRole('unknown'), 'accent-slate');
    },
  },
  {
    name: 'isEmojiOnly allows emoji sequences and rejects text',
    run: () => {
      assert.equal(isEmojiOnly('😀👍🏽'), true);
      assert.equal(isEmojiOnly('hello😀'), false);
      assert.equal(isEmojiOnly('123'), false);
    },
  },
  {
    name: 'countGraphemes respects emoji clusters',
    run: () => {
      assert.equal(countGraphemes('😀👍🏽'), 2);
      assert.equal(countGraphemes('😀'), 1);
    },
  },
];

let passed = 0;

for (const test of tests) {
  try {
    await test.run();
    passed += 1;
    console.log(`✅ ${test.name}`);
  } catch (error) {
    console.error(`❌ ${test.name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const failed = tests.length - passed;
console.log(`\n${passed}/${tests.length} tests passed.`);
if (failed > 0) {
  process.exit(1);
}
