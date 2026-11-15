import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseHelpDocument, type HelpArticle } from "@/lib/help/guide";

/** Guide pages live in content/help as markdown so search can run in the browser. */
export function loadHelpArticles(): HelpArticle[] {
  const files = readdirSync(path.join(process.cwd(), "content", "help"))
    .filter((name) => name.endsWith(".md"))
    .sort();
  return files.map((name) =>
    parseHelpDocument(name, readFileSync(path.join(process.cwd(), "content", "help", name), "utf8")),
  );
}
