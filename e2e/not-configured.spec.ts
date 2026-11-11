import { expect, test } from "@playwright/test";

test("shows a not-configured screen when Supabase is unset", async ({ page }) => {
  test.skip(Boolean(process.env.SSCB_E2E_SUPABASE_URL), "This check is for a deployment without Supabase.");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "This deployment is not configured" })).toBeVisible();
  await expect(page.getByText("NEXT_PUBLIC_SUPABASE_URL")).toBeVisible();
  await expect(page.getByText("Interactive Demo")).toHaveCount(0);
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "This deployment is not configured" })).toBeVisible();
});
