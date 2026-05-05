/**
 * Best-effort, regex + brace-balancing symbol extractor.
 *
 * Pulls top-level functions, classes, types, etc. out of a source file so each
 * one can be saved as its own snippet. Not a real parser — works for the 80%
 * common case across mainstream languages and skips silently when it isn't
 * confident.
 */

export type ExtractedSymbol = {
  name: string;
  kind: string; // function, class, type, struct, etc.
  code: string;
  line: number;
};

const MAX_SYMBOLS_PER_FILE = 50;
const MIN_SYMBOL_LINES = 2; // skip single-line trivialities like `const X = 1;`
const MAX_SYMBOL_BYTES = 8000;

export function extractSymbols(code: string, language: string): ExtractedSymbol[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return extractCurlyBraced(code, TS_PATTERNS);
    case "go":
      return extractCurlyBraced(code, GO_PATTERNS);
    case "rust":
      return extractCurlyBraced(code, RUST_PATTERNS);
    case "java":
    case "csharp":
    case "kotlin":
    case "swift":
      return extractCurlyBraced(code, JAVA_PATTERNS);
    case "python":
      return extractPython(code);
    default:
      return [];
  }
}

// ─── Pattern definitions ───
// Each pattern matches the *signature* line. The extractor then captures
// either a curly-brace block or an indented block following the match.

type SignaturePattern = {
  kind: string;
  // Regex must be /gm with one capturing group for the symbol name.
  regex: RegExp;
};

// JS/TS reserved words we never want as a "method name" (avoids matching
// `if (...) {`, `for (...) {`, etc. as if they were class methods).
const JS_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "do", "else", "try",
  "with", "function", "class", "const", "let", "var", "import", "export",
  "throw", "await", "async", "new", "typeof", "delete", "in", "of",
  "instanceof", "void", "yield", "case", "default", "finally", "break",
  "continue", "this", "super", "extends", "implements", "interface",
  "type", "enum", "namespace", "module", "declare", "abstract", "static",
  "public", "private", "protected", "readonly", "constructor",
]);

const TS_PATTERNS: SignaturePattern[] = [
  // function foo() {} | export function foo() {} | export default function foo() {} | async function foo() {}
  {
    kind: "function",
    regex: /^[ \t]*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\s*[<(]/gm,
  },
  // class Foo {} | export class Foo {} | abstract class Foo {}
  {
    kind: "class",
    regex: /^[ \t]*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  },
  // interface Foo {}
  {
    kind: "interface",
    regex: /^[ \t]*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/gm,
  },
  // type Foo = ... — captures up to the next blank line / next top-level decl
  {
    kind: "type",
    regex: /^[ \t]*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[<=]/gm,
  },
  // const/let/var foo = (...) => { ... } | = function (...) { ... } | = useCallback(() => {})
  // The trailing context is permissive so it matches `= useCallback(async () => {`,
  // `= memo((props) => {`, `= forwardRef((props, ref) => {`, etc.
  {
    kind: "function",
    regex: /^[ \t]*(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]*?)?=\s*(?:async\s+)?(?:function\b|(?:[\w.]+\s*\()*\s*(?:async\s+)?(?:<[^>]*>\s*)?\([^)]*\)\s*(?::\s*[^={]+)?\s*=>)/gm,
  },
  // export default (...) => { ... } | export default function() {}
  {
    kind: "function",
    regex: /^[ \t]*export\s+default\s+(?:async\s+)?(?:function\s*\*?\s*\(|\([^)]*\)\s*=>)/gm,
  },
  // Class methods / object methods: indented `name(args) { ... }` or `async name(args) { ... }`
  // Restricted to indented lines (so it won't match top-level function calls) and not a keyword.
  {
    kind: "method",
    regex: /^[ \t]+(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+|override\s+|get\s+|set\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{=;]+)?\s*\{/gm,
  },
];

const GO_PATTERNS: SignaturePattern[] = [
  {
    kind: "function",
    regex: /^\s*func(?:\s*\([^)]*\))?\s+([A-Za-z_][\w]*)\s*[(<]/gm,
  },
  {
    kind: "type",
    regex: /^\s*type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/gm,
  },
];

const RUST_PATTERNS: SignaturePattern[] = [
  {
    kind: "function",
    regex: /^\s*(?:pub\s+(?:\([^)]+\)\s+)?)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/gm,
  },
  {
    kind: "struct",
    regex: /^\s*(?:pub\s+(?:\([^)]+\)\s+)?)?struct\s+([A-Za-z_][\w]*)/gm,
  },
  {
    kind: "impl",
    regex: /^\s*impl(?:<[^>]+>)?\s+([A-Za-z_][\w:]*)/gm,
  },
  {
    kind: "trait",
    regex: /^\s*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)/gm,
  },
];

const JAVA_PATTERNS: SignaturePattern[] = [
  {
    kind: "class",
    regex: /^\s*(?:public|private|protected|internal|abstract|final|sealed|open|static|\s)*class\s+([A-Za-z_][\w]*)/gm,
  },
  {
    kind: "method",
    regex: /^\s*(?:public|private|protected|internal|static|final|override|fun|virtual|async|\s)+[\w<>,\[\] ?]+\s+([A-Za-z_][\w]*)\s*\(/gm,
  },
];

// ─── Curly-brace extractor ───

function extractCurlyBraced(code: string, patterns: SignaturePattern[]): ExtractedSymbol[] {
  const out: ExtractedSymbol[] = [];
  const seen = new Set<string>(); // dedupe by start offset

  for (const { kind, regex } of patterns) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code))) {
      const startIdx = match.index;
      const name = match[1];
      if (!name) continue;
      if (JS_KEYWORDS.has(name)) continue;
      if (seen.has(`${startIdx}`)) continue;
      seen.add(`${startIdx}`);

      const block = grabBraceBlock(code, startIdx);
      if (!block) continue;

      const symbolCode = code.slice(startIdx, block.endIdx + 1);
      if (symbolCode.length > MAX_SYMBOL_BYTES) continue;
      const lineCount = symbolCode.split("\n").length;
      if (lineCount < MIN_SYMBOL_LINES) continue;

      out.push({
        name,
        kind,
        code: dedent(symbolCode),
        line: lineNumberOf(code, startIdx),
      });
      if (out.length >= MAX_SYMBOLS_PER_FILE) return out;
    }
  }

  // Sort by file order
  out.sort((a, b) => a.line - b.line);
  return out;
}

function grabBraceBlock(code: string, fromIdx: number): { startIdx: number; endIdx: number } | null {
  // Find first '{' on the same statement (skip past type annotations, params, etc.)
  let openIdx = -1;
  let parenDepth = 0;
  let angleDepth = 0;
  for (let i = fromIdx; i < code.length; i++) {
    const c = code[i];
    if (c === "(") parenDepth++;
    else if (c === ")") parenDepth--;
    else if (c === "<") angleDepth++;
    else if (c === ">" && angleDepth > 0) angleDepth--;
    else if (c === "{" && parenDepth === 0) {
      openIdx = i;
      break;
    } else if (c === ";" && parenDepth === 0) {
      // Function declaration ends in `;` (e.g. interface method) — no body
      return null;
    } else if (c === "\n" && parenDepth === 0 && angleDepth === 0) {
      // Look ahead a bit for `{` on same logical statement
      const next = code.slice(i, Math.min(i + 200, code.length));
      const m = next.match(/^[\s]*\{/);
      if (m) {
        openIdx = i + m[0].length - 1;
        break;
      }
    }
  }
  if (openIdx === -1) return null;

  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let prev = "";

  for (let i = openIdx; i < code.length; i++) {
    const c = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      prev = c;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      prev = c;
      continue;
    }
    if (inString) {
      if (c === inString && prev !== "\\") inString = null;
      prev = c;
      continue;
    }

    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      prev = c;
      continue;
    }

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { startIdx: fromIdx, endIdx: i };
    }
    prev = c;
  }
  return null;
}

// ─── Python (indentation-based) ───

function extractPython(code: string): ExtractedSymbol[] {
  const lines = code.split("\n");
  const out: ExtractedSymbol[] = [];
  const SIG = /^(\s*)(async\s+def|def|class)\s+([A-Za-z_]\w*)/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SIG);
    if (!m) continue;
    const indent = m[1].length;
    const kind = m[2].includes("def") ? "function" : "class";
    const name = m[3];

    // Find end: first line at or below `indent` that isn't blank/comment.
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const ln = lines[j];
      if (ln.trim() === "" || ln.trim().startsWith("#")) {
        end = j;
        continue;
      }
      const leading = ln.match(/^\s*/)![0].length;
      if (leading <= indent) break;
      end = j;
    }

    const symbolCode = dedent(lines.slice(i, end + 1).join("\n"));
    if (symbolCode.length > MAX_SYMBOL_BYTES) continue;
    if (end - i + 1 < MIN_SYMBOL_LINES) continue;

    out.push({ name, kind, code: symbolCode, line: i + 1 });
    if (out.length >= MAX_SYMBOLS_PER_FILE) return out;
  }
  return out;
}

// ─── Helpers ───

function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  if (min === 0) return text;
  return lines.map((l) => l.slice(min)).join("\n");
}

function lineNumberOf(code: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (code[i] === "\n") line++;
  return line;
}
