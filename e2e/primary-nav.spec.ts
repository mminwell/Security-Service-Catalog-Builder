import { expect, test } from "@playwright/test";

const labels = ["Catalog", "Fields", "Lookups", "Artifacts", "CSF Mapping", "Templates"];

test("keeps the primary nav on one line at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.evaluate((items) => {
    const header = document.createElement("header");
    header.className = "topbar";
    const links = items
      .map((label) => `<a href="/${label.toLowerCase().replace(/\s+/g, "-")}">${label}</a>`)
      .join("");
    header.innerHTML = `
      <div class="topbar-main">
        <a class="brand" href="/catalog"><strong>Security Service Catalog</strong><span>Catalog builder</span></a>
        <nav class="nav" aria-label="Primary">${links}</nav>
        <button type="button" class="btn btn-secondary switcher-trigger">Northwind Traders</button>
        <button type="button" class="btn btn-secondary user-trigger"><span class="who">Ada · Admin</span></button>
        <button type="button" class="btn btn-secondary">Sign out</button>
      </div>`;
    document.body.prepend(header);
  }, labels);

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText(labels);
  const tops = await nav.getByRole("link").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  expect(new Set(tops.map((top) => Math.round(top))).size).toBe(1);
  const fits = await page.locator(".topbar-main").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  const wrapped = await page.locator(".topbar-main").evaluate((el) => getComputedStyle(el).flexWrap);
  expect(wrapped).toBe("nowrap");
});
