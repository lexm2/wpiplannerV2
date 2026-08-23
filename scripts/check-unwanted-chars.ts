// Fails CI if source contains characters assistants default to but this
// codebase doesn't use: em dashes and emoji. Run with --fix to replace/strip
// in place.
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
    continue;
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

if (!fix && violations > 0) {
  console.error(
    `\n${violations} unwanted character occurrence(s) found. Run "bun run check:unwanted-chars -- --fix" to replace them.`,
  );
  process.exit(1);
}
