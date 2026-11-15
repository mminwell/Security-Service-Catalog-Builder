"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeAnchoredPanel } from "@/lib/catalog/popup-placement";
import {
  SUPPORT_EMAIL,
  helpForRoute,
  helpSections,
  helpSnippet,
  searchHelp,
  type HelpArticle,
} from "@/lib/help/guide";
import { useDismiss } from "@/components/widgets";

const HelpContentContext = createContext<HelpArticle[]>([]);

export function HelpContentProvider({ articles, children }: { articles: HelpArticle[]; children: ReactNode }) {
  return <HelpContentContext.Provider value={articles}>{children}</HelpContentContext.Provider>;
}

export function HelpButton() {
  const articles = useContext(HelpContentContext);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissRef = useDismiss(open, () => setOpen(false), panelRef);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const placement = placeAnchoredPanel(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
        360,
        "end",
      );
      setPanelStyle({
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const results = useMemo(() => searchHelp(articles, query), [articles, query]);
  const onPage = useMemo(() => helpForRoute(articles, pathname), [articles, pathname]);
  const sections = useMemo(() => helpSections(articles), [articles]);
  const article = articles.find((item) => item.slug === selected) ?? null;

  return (
    <div className="help-anchor" ref={dismissRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary help-trigger"
        aria-label="Help"
        aria-expanded={open}
        aria-controls="help-panel"
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id="help-panel"
              className="switcher-panel help-panel"
              ref={panelRef}
              role="dialog"
              aria-label="Help"
              style={panelStyle}
            >
              <p className="micro">Help</p>
              <label className="sr-only" htmlFor="help-search">
                Search the guide
              </label>
              <input
                id="help-search"
                className="input"
                type="search"
                placeholder="Search the guide"
                aria-label="Search the guide"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                }}
              />
              {article ? (
                <article className="help-article">
                  <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                    Back
                  </button>
                  <h2>{article.title}</h2>
                  <HelpBody body={article.body} />
                </article>
              ) : query.trim() ? (
                <ul className="help-results">
                  {results.length === 0 ? <li className="hint">No matching guide pages.</li> : null}
                  {results.map((item) => (
                    <li key={item.slug}>
                      <button type="button" onClick={() => setSelected(item.slug)}>
                        <strong>{item.title}</strong>
                        <span>{helpSnippet(item, query)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  {onPage.length > 0 ? (
                    <div className="help-group">
                      <p className="micro">On this page</p>
                      {onPage.map((item) => (
                        <button key={item.slug} type="button" className="help-link" onClick={() => setSelected(item.slug)}>
                          {item.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {sections.map((group) => (
                    <div className="help-group" key={group.section}>
                      <p className="micro">{group.section}</p>
                      {group.articles.map((item) => (
                        <button key={item.slug} type="button" className="help-link" onClick={() => setSelected(item.slug)}>
                          {item.title}
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
              <a className="help-contact" href={`mailto:${SUPPORT_EMAIL}`}>
                Contact support
              </a>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function HelpBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.startsWith("## ")) return <h3 key={index}>{block.slice(3)}</h3>;
        if (block.startsWith("# ")) return <h3 key={index}>{block.slice(2)}</h3>;
        if (block.startsWith("- ")) {
          return (
            <ul key={index}>
              {block.split("\n").map((line) => (
                <li key={line}>{line.replace(/^- /, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </>
  );
}
