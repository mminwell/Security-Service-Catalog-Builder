"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { FILTER_PANEL_PREFERRED_WIDTH, placeAnchoredPanel, placementRelativeToTrigger } from "@/lib/catalog/popup-placement";

const EMPTY: CSSProperties = {};

/** Keep an absolutely positioned panel attached to its trigger and inside the viewport. */
export function useAnchoredPanel(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  preferredWidth = FILTER_PANEL_PREFERRED_WIDTH,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>(EMPTY);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const trigger = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      const placement = placeAnchoredPanel(trigger, { width: window.innerWidth, height: window.innerHeight }, preferredWidth);
      const relative = placementRelativeToTrigger(placement, trigger);
      const next: CSSProperties = {
        top: relative.top,
        left: relative.left,
        width: relative.width,
        maxHeight: relative.maxHeight,
      };
      setStyle((current) =>
        current.top === next.top && current.left === next.left && current.width === next.width && current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, preferredWidth]);

  return open ? style : EMPTY;
}
