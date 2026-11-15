import { isDemoPath, stripDemoPrefix } from "@/lib/demo/paths";

export const SUPPORT_EMAIL = "mikeminwell2002@protonmail.com";

export type HelpArticle = {
  slug: string;
  title: string;
  section: string;
  order: number;
  /** Path prefixes. `/demo` matches the whole demo. Other routes also match inside `/demo`. */
  routes: string[];
  body: string;
};

export function parseHelpDocument(filename: string, source: string): HelpArticle {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source.trim());
  if (!match) throw new Error(`Help file ${filename} is missing front matter.`);
  const meta = parseFrontMatter(match[1] ?? "");
  const title = meta.title?.trim();
  const section = meta.section?.trim();
  if (!title) throw new Error(`Help file ${filename} needs a title.`);
  if (!section) throw new Error(`Help file ${filename} needs a section.`);
  const order = Number(meta.order ?? "0");
  return {
    slug: filename.replace(/\.md$/i, ""),
    title,
    section,
    order: Number.isFinite(order) ? order : 0,
    routes: meta.routes,
    body: (match[2] ?? "").trim(),
  };
}

export function searchHelp(articles: HelpArticle[], query: string): HelpArticle[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ordered = [...articles].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  if (terms.length === 0) return ordered;
  return ordered.filter((article) => {
    const haystack = `${article.title}\n${article.section}\n${article.body}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function helpSections(articles: HelpArticle[]): Array<{ section: string; articles: HelpArticle[] }> {
  const groups: Array<{ section: string; articles: HelpArticle[] }> = [];
  for (const article of searchHelp(articles, "")) {
    const current = groups.find((group) => group.section === article.section);
    if (current) current.articles.push(article);
    else groups.push({ section: article.section, articles: [article] });
  }
  return groups;
}

export function helpForRoute(articles: HelpArticle[], pathname: string): HelpArticle[] {
  return searchHelp(articles, "").filter((article) => article.routes.some((route) => routeMatches(pathname, route)));
}

export function helpSnippet(article: HelpArticle, query: string): string {
  const plain = article.body.replace(/[#>*_`[\]]/g, " ").replace(/\s+/g, " ").trim();
  const needle = query.trim().toLowerCase().split(/\s+/).find(Boolean) ?? "";
  const index = needle ? plain.toLowerCase().indexOf(needle) : 0;
  const start = index > 40 ? index - 40 : 0;
  const slice = plain.slice(start, start + 160).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + 160 < plain.length ? "…" : ""}`;
}

function routeMatches(pathname: string, route: string): boolean {
  if (route === "/demo") return isDemoPath(pathname);
  const path = stripDemoPrefix(pathname);
  return path === route || path.startsWith(`${route}/`);
}

function parseFrontMatter(block: string): { title?: string; section?: string; order?: string; routes: string[] } {
  const routes: string[] = [];
  const fields: Record<string, string> = {};
  let inRoutes = false;
  for (const line of block.split(/\r?\n/)) {
    if (/^routes:\s*$/.test(line)) {
      inRoutes = true;
      continue;
    }
    if (inRoutes) {
      const item = /^\s*-\s+(\S+)\s*$/.exec(line);
      if (item?.[1]) {
        routes.push(item[1]);
        continue;
      }
      inRoutes = false;
    }
    const field = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (field?.[1]) fields[field[1]] = (field[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
  return { title: fields.title, section: fields.section, order: fields.order, routes };
}
