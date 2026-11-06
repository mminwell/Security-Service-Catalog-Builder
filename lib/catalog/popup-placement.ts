/** Viewport box for a trigger or a floating panel. Coordinates are viewport pixels. */
export type ViewportBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type AnchoredPanelPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 12;
export const FILTER_PANEL_PREFERRED_WIDTH = 420;
const MAX_PANEL_HEIGHT = 520;
const MIN_USEFUL_HEIGHT = 160;

/**
 * Place a panel under its trigger, aligned to the trigger's left edge,
 * then shift and shrink so the panel stays inside the viewport.
 * The Filter control sits on the left of the catalog toolbar; this keeps
 * the pop-up beside that control instead of running off the right edge.
 */
export function placeAnchoredPanel(
  trigger: ViewportBox,
  viewport: ViewportSize,
  preferredWidth = FILTER_PANEL_PREFERRED_WIDTH,
): AnchoredPanelPlacement {
  const margin = VIEWPORT_MARGIN;
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(preferredWidth, maxWidth);

  let left = trigger.left;
  if (left + width > viewport.width - margin) {
    left = viewport.width - margin - width;
  }
  if (left < margin) left = margin;

  const spaceBelow = viewport.height - (trigger.top + trigger.height) - PANEL_GAP - margin;
  const spaceAbove = trigger.top - PANEL_GAP - margin;
  const openBelow = spaceBelow >= MIN_USEFUL_HEIGHT || spaceBelow >= spaceAbove;
  const available = Math.max(0, openBelow ? spaceBelow : spaceAbove);
  const ceiling = Math.max(0, viewport.height - margin * 2);
  const maxHeight = Math.min(MAX_PANEL_HEIGHT, ceiling, Math.max(available, Math.min(MIN_USEFUL_HEIGHT, ceiling)));

  let top = openBelow ? trigger.top + trigger.height + PANEL_GAP : trigger.top - PANEL_GAP - maxHeight;
  if (top < margin) top = margin;
  if (top + maxHeight > viewport.height - margin) {
    top = Math.max(margin, viewport.height - margin - maxHeight);
  }

  return { top, left, width, maxHeight };
}

/** Convert a viewport placement into offsets relative to the trigger's top-left. */
export function placementRelativeToTrigger(
  placement: AnchoredPanelPlacement,
  trigger: ViewportBox,
): { top: number; left: number; width: number; maxHeight: number } {
  return {
    top: placement.top - trigger.top,
    left: placement.left - trigger.left,
    width: placement.width,
    maxHeight: placement.maxHeight,
  };
}
