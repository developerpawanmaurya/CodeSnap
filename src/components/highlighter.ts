/**
 * Lightweight syntax highlighter — only the languages we actually use.
 *
 * The default `react-syntax-highlighter` import loads ~280 Prism language
 * grammars (multi-MB bundle, slow to parse). PrismLight + manual registration
 * keeps the bundle to a few KB per language.
 */
"use client";

import { PrismLight } from "react-syntax-highlighter";

import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup"; // html
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";

PrismLight.registerLanguage("typescript", typescript);
PrismLight.registerLanguage("javascript", javascript);
PrismLight.registerLanguage("jsx", jsx);
PrismLight.registerLanguage("tsx", tsx);
PrismLight.registerLanguage("python", python);
PrismLight.registerLanguage("go", go);
PrismLight.registerLanguage("rust", rust);
PrismLight.registerLanguage("java", java);
PrismLight.registerLanguage("csharp", csharp);
PrismLight.registerLanguage("ruby", ruby);
PrismLight.registerLanguage("php", php);
PrismLight.registerLanguage("swift", swift);
PrismLight.registerLanguage("kotlin", kotlin);
PrismLight.registerLanguage("bash", bash);
PrismLight.registerLanguage("sql", sql);
PrismLight.registerLanguage("css", css);
PrismLight.registerLanguage("html", markup);
PrismLight.registerLanguage("json", json);
PrismLight.registerLanguage("yaml", yaml);
PrismLight.registerLanguage("markdown", markdown);

export { PrismLight as SyntaxHighlighter };

// Inline a tiny VS Dark-ish theme as plain CSS so we don't need to ship a
// full PrismJS theme module either.
export const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: "#d4d4d4", background: "transparent" },
  'pre[class*="language-"]': { color: "#d4d4d4", background: "transparent" },
  comment: { color: "#6a9955", fontStyle: "italic" },
  prolog: { color: "#6a9955" },
  doctype: { color: "#6a9955" },
  cdata: { color: "#6a9955" },
  punctuation: { color: "#d4d4d4" },
  property: { color: "#9cdcfe" },
  tag: { color: "#569cd6" },
  boolean: { color: "#569cd6" },
  number: { color: "#b5cea8" },
  constant: { color: "#9cdcfe" },
  symbol: { color: "#b5cea8" },
  selector: { color: "#d7ba7d" },
  "attr-name": { color: "#9cdcfe" },
  string: { color: "#ce9178" },
  char: { color: "#ce9178" },
  builtin: { color: "#4ec9b0" },
  inserted: { color: "#b5cea8" },
  operator: { color: "#d4d4d4" },
  entity: { color: "#9cdcfe", cursor: "help" },
  url: { color: "#9cdcfe" },
  variable: { color: "#9cdcfe" },
  atrule: { color: "#c586c0" },
  "attr-value": { color: "#ce9178" },
  function: { color: "#dcdcaa" },
  "class-name": { color: "#4ec9b0" },
  keyword: { color: "#569cd6" },
  regex: { color: "#d16969" },
  important: { color: "#569cd6", fontWeight: "bold" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  deleted: { color: "#ce9178" },
};
