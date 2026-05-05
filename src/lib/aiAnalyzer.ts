/**
 * AI-powered code analysis.
 *
 * Sends a source file to GPT-4o-mini and asks it to identify the coherent
 * functional units it contains. Each unit gets a human-readable title (e.g.
 * "Load more posts pagination" instead of "PostList.tsx"), a one-line
 * description, optional tags, and a line range pointing back into the file.
 *
 * For mixed-language files (a .php with inline HTML/CSS/JS, a Vue SFC with
 * <template>+<script>+<style>) the model is instructed to keep tightly-coupled
 * code together as one unit, not split it across snippets.
 */

import OpenAI from "openai";

const MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export function aiAnalysisAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export type AIUnit = {
  title: string;
  description: string;
  tags: string[];
  lineStart: number; // 1-based, inclusive
  lineEnd: number; // 1-based, inclusive
};

export type AIAnalysis = {
  units: AIUnit[];
};

const SYSTEM_PROMPT = `You are a senior engineer cataloguing a codebase as reusable snippets.

Given a source file, identify the coherent FUNCTIONAL units it contains. A unit is a piece of code that does one thing and could be searched for later by a developer asking "how do I do X?".

RULES:
1. Title: a clear, sentence-case description of what the code DOES, not what it IS. Good: "Validate email with regex", "Load more posts pagination", "Dark mode toggle". Bad: "isValidEmail function", "PostList component", "main.js".
2. Description: one sentence, plain English, what + why.
3. Tags: 2-5 short kebab-case keywords (e.g. ["validation", "email", "regex"]). Lowercase.
4. lineStart / lineEnd: 1-based inclusive line numbers in the original file. Pick the SMALLEST range that contains a self-contained unit (include relevant types, helper functions, and tightly-coupled code).
5. For mixed-language files (PHP with inline HTML/JS, Vue SFCs, HTML with embedded <script>/<style>): keep markup + script + style for the SAME feature in ONE unit. Do not split them.
6. Skip pure boilerplate: imports, license headers, type-only re-exports, generated code.
7. If the entire file is one tightly-coupled unit, return ONE entry covering the meaningful range.
8. If the file has nothing extractable (just imports / config / blank), return { "units": [] }.
9. Return AT MOST 8 units per file. Prefer fewer, larger, more meaningful units over many tiny ones.

OUTPUT: strictly valid JSON matching the schema:
{ "units": [{ "title": string, "description": string, "tags": string[], "lineStart": int, "lineEnd": int }] }

Do not include markdown fences, prose, or explanation. JSON only.`;

export async function analyzeFile(args: {
  filePath: string;
  language: string;
  code: string;
}): Promise<AIAnalysis> {
  const { filePath, language, code } = args;

  // Number every line so the model can return line ranges precisely.
  const numbered = code
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}  ${line}`)
    .join("\n");

  const userPrompt = `File: ${filePath}
Language: ${language}

\`\`\`
${numbered}
\`\`\``;

  const resp = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { units: [] };
  }

  const units: AIUnit[] = Array.isArray(parsed.units) ? parsed.units : [];
  const lineCount = code.split("\n").length;

  return {
    units: units
      .filter((u) => u && typeof u.title === "string" && Number.isInteger(u.lineStart) && Number.isInteger(u.lineEnd))
      .map((u) => ({
        title: String(u.title).trim().slice(0, 120),
        description: String(u.description || "").trim().slice(0, 300),
        tags: Array.isArray(u.tags)
          ? u.tags.map((t: any) => String(t).toLowerCase().replace(/[^a-z0-9-]+/g, "").slice(0, 24)).filter(Boolean).slice(0, 8)
          : [],
        lineStart: Math.max(1, Math.min(lineCount, u.lineStart)),
        lineEnd: Math.max(1, Math.min(lineCount, u.lineEnd)),
      }))
      .filter((u) => u.lineEnd >= u.lineStart),
  };
}

/**
 * Pull a code excerpt from the original file given a 1-based inclusive range.
 * Trims trailing/leading blank lines.
 */
export function sliceByLines(code: string, lineStart: number, lineEnd: number): string {
  const lines = code.split("\n");
  const slice = lines.slice(lineStart - 1, lineEnd);
  // Strip leading & trailing blank lines for tidiness
  while (slice.length && slice[0].trim() === "") slice.shift();
  while (slice.length && slice[slice.length - 1].trim() === "") slice.pop();
  return slice.join("\n");
}

/**
 * Re-title an existing snippet (used by the "Re-title with AI" action on
 * already-imported file snippets). Returns just title/description/tags;
 * caller decides whether to also rewrite the code.
 */
export async function suggestTitleAndDescription(args: {
  code: string;
  language: string;
  currentTitle?: string;
}): Promise<{ title: string; description: string; tags: string[] } | null> {
  const { code, language, currentTitle } = args;
  const userPrompt = `Code (${language}):
\`\`\`
${code.slice(0, 8000)}
\`\`\`

${currentTitle ? `Current title (likely a file path or class name — replace with a functional title): ${currentTitle}` : ""}

Give this code a clear functional title, a one-sentence description, and 2-5 lowercase kebab-case tags. Return JSON: { "title": string, "description": string, "tags": string[] }. JSON only.`;

  try {
    const resp = await client().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You name code snippets clearly. Titles describe what the code DOES (sentence case, 5-10 words), not what it IS. Output strictly valid JSON.",
        },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = resp.choices[0]?.message?.content || "";
    const parsed = JSON.parse(raw);
    if (!parsed?.title) return null;
    return {
      title: String(parsed.title).trim().slice(0, 120),
      description: String(parsed.description || "").trim().slice(0, 300),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t: any) => String(t).toLowerCase().replace(/[^a-z0-9-]+/g, "").slice(0, 24)).filter(Boolean).slice(0, 8)
        : [],
    };
  } catch {
    return null;
  }
}
