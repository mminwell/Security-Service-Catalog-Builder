import { expect, test } from "@playwright/test";

test("demo is interactive and does not call Supabase", async ({ page }) => {
  const hits: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/_next/")) return;
    if (/supabase\.co|\/auth\/v1|service_role/i.test(url)) hits.push(url);
  });

  await page.goto("/demo");
  await expect(page.getByText("Demo mode, nothing is saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enterprise Security Monitoring" })).toBeVisible();

  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("searchbox", { name: "Search the guide" }).fill("magic link");
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Enterprise Security Monitoring" }).click();
  await expect(page).toHaveURL(/\/demo\/services\//);
  const name = page.getByRole("textbox", { name: "Service Name" });
  await expect(name).toHaveValue("Enterprise Security Monitoring");
  await name.fill("Browser only change");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Service saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Service Name" })).toHaveValue("Enterprise Security Monitoring");
  expect(hits).toEqual([]);
});
