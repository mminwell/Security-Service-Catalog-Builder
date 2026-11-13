import { expect, test } from "@playwright/test";

test.describe("workspace menu is not clipped by the header", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`stays fully visible at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => {
        const header = document.createElement("header");
        header.className = "topbar";
        header.innerHTML = `
          <div class="topbar-main">
            <a class="brand" href="/catalog"><strong>Security Service Catalog</strong><span>Catalog builder</span></a>
            <nav class="nav" aria-label="Primary">
              <a href="/catalog">Catalog</a>
              <a href="/artifacts">Artifacts</a>
              <a href="/coverage">CSF Mapping</a>
              <a href="/templates">Templates</a>
            </nav>
            <div class="switcher">
              <button type="button" class="btn btn-secondary switcher-trigger">Starter Workspace</button>
              <div class="switcher-panel" style="position:absolute; top: calc(100% + 8px); right: 0; left: auto;">
                <p class="micro">Workspaces</p>
                <form class="stack">
                  <label for="workspace-name">Workspace name</label>
                  <input id="workspace-name" class="input" value="Starter Workspace" aria-label="Workspace name" />
                  <div class="row-actions">
                    <button type="button" class="btn btn-primary">Save</button>
                    <button type="button" class="btn btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          </div>`;
        document.body.prepend(header);
      });

      const panel = page.locator(".switcher-panel");
      await expect(panel).toBeVisible();
      await expect(page.getByLabel("Workspace name")).toHaveValue("Starter Workspace");
      await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(48);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

      const clipped = await panel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const clips = (value: string) => value === "auto" || value === "hidden" || value === "scroll" || value === "clip";
        let node = el.parentElement;
        while (node) {
          const style = getComputedStyle(node);
          if (clips(style.overflowX) || clips(style.overflowY)) {
            const bounds = node.getBoundingClientRect();
            const outside =
              rect.bottom > bounds.bottom + 1 ||
              rect.top < bounds.top - 1 ||
              rect.right > bounds.right + 1 ||
              rect.left < bounds.left - 1;
            if (outside) return node.className || node.tagName;
          }
          node = node.parentElement;
        }
        return "";
      });
      expect(clipped).toBe("");

      const headerOverflow = await page.locator(".topbar-main").evaluate((el) => getComputedStyle(el).overflowX);
      expect(headerOverflow).toBe("visible");
    });
  }
});
