// Fails CI if source contains characters assistants default to but this
// codebase doesn't use: em dashes, emoji, and arrows. Run with --fix to
// replace/strip in place.
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { extname, join, resolve } from 'path';

const SCAN_DIRS = ['src', 'scripts', 'tests'];
const ROOT_FILES = [
  'playwright.config.ts',
  'svelte.config.js',
  'vite.config.ts',
  'vitest.config.ts',
];
const EXTENSIONS = new Set(['.ts', '.svelte', '.js', '.mjs', '.sh', '.css']);
// Excluded so --fix can't rewrite the very patterns it's matching against.
const SELF_PATH = resolve(import.meta.dirname, 'check-unwanted-chars.ts');

const VS16 = String.fromCharCode(0xfe0f);
const ZWJ = String.fromCharCode(0x200d);
// Emoji-presentation chars, VS16-forced pictographs, flags, and keycap
// sequences - deliberately excludes bare dingbats/symbols (->, (check), (c))
// that default to text presentation and show up legitimately in code/CSS.
const EMOJI_SOURCE =
  `(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}${VS16})(?:\\p{Emoji_Modifier})?` +
  `(?:${ZWJ}(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}${VS16})(?:\\p{Emoji_Modifier})?)*` +
  `|[\\u{1F1E6}-\\u{1F1FF}]{2}` +
  `|[0-9#*]${VS16}?\\u20E3`;

// Arrows in every direction: the Arrows block, its three supplements, and the
// arrow runs of Dingbats, Misc Symbols and Arrows, and the halfwidth forms.
// Several of these (right/left/up/down black arrow) are emoji-capable but
// default to text presentation, so the emoji rule above never sees them.
const ARROW_SOURCE =
  '[\\u2190-\\u21FF\\u2794\\u2798-\\u27AF\\u27B1-\\u27BE\\u27F0-\\u27FF' +
  '\\u2900-\\u297F\\u2B00-\\u2B11\\u2B30-\\u2B4F\\u2B5A-\\u2B95' +
  '\\uFFE9-\\uFFEC\\u{1F800}-\\u{1F8FF}]';

// Only the arrows with an unambiguous ASCII spelling. "Sorted (up-down)" is a
// guess a script has no business making, so the rest are left for a human -
// and in UI text the answer is usually an icon, which no rewrite can produce.
const ARROW_ASCII: Record<string, string> = {
  '\u2190': '<-',
  '\u2192': '->',
  '\u2194': '<->',
  '\u21D0': '<=',
  '\u21D2': '=>',
  '\u21D4': '<=>',
  '\u27F5': '<--',
  '\u27F6': '-->',
  '\u27F7': '<-->',
  '\u27F8': '<==',
  '\u27F9': '==>',
  '\u27FA': '<==>',
  '\u27A1': '->',
  '\u2B05': '<-',
  '\u2B95': '->',
};

type Rule = {
  name: string;
  pattern: () => RegExp;
  fix: (text: string) => string;
};

const RULES: Rule[] = [
  {
    name: 'em dash',
    pattern: () => /—/gu,
    fix: text => text.split('—').join('-'),
  },
  {
    name: 'emoji',
    pattern: () => new RegExp(EMOJI_SOURCE, 'gu'),
    fix: text => text.replace(new RegExp(EMOJI_SOURCE, 'gu'), ''),
  },
  {
    name: 'arrow',
    pattern: () => new RegExp(ARROW_SOURCE, 'gu'),
    fix: text =>
      text.replace(
        new RegExp(ARROW_SOURCE, 'gu'),
        match => ARROW_ASCII[match] ?? match,
      ),
  },
];

function collectFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
}

const files: string[] = [];
for (const dir of SCAN_DIRS) {
  if (existsSync(dir)) collectFiles(dir, files);
}
for (const file of ROOT_FILES) {
  if (existsSync(file)) files.push(file);
}

const fix = process.argv.includes('--fix');
let violations = 0;

for (const file of files) {
  if (resolve(file) === SELF_PATH) continue;
  let text = readFileSync(file, 'utf-8');
  const matched = RULES.filter(rule => rule.pattern().test(text));
  if (matched.length === 0) continue;

  if (fix) {
    for (const rule of matched) text = rule.fix(text);
    writeFileSync(file, text);
    // Fall through to reporting when a fix could not spell something in ASCII:
    // a silent pass here is a CI failure later, on the same characters.
    if (!RULES.some(rule => rule.pattern().test(text))) continue;
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const rule of matched) {
      if (rule.pattern().test(lines[i])) {
        console.error(`${file}:${i + 1}: ${rule.name} found`);
        violations++;
      }
    }
  }
}

if (fix && violations > 0) {
  console.error(
    `\n${violations} occurrence(s) have no ASCII spelling worth guessing at; replace them by hand.`,
  );
}

if (!fix && violations > 0) {
  console.error(
    `\n${violations} unwanted character occurrence(s) found. Run "bun run check:unwanted-chars -- --fix" to replace them.`,
  );
  process.exit(1);
}
