import { expect, test } from "@playwright/test";

// The main path a creator takes: sign up, set invoice details, add a deal,
// invoice the brand, get paid, and see it on the dashboard.
test("a creator goes from pitch to paid", async ({ page }) => {
  // Sign in (development email login) and create a workspace.
  await page.goto("/login");
  await page.getByLabel("Email").fill(`e2e.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("E2E Creator");
  await page.getByLabel("GST state code (optional)").fill("07");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Invoice details: GST registered in Delhi.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("GSTIN (if registered)").fill("07ABCDE1234F1Z5");
  await page.getByLabel("UPI ID for payments").fill("e2e@okaxis");
  await page.getByRole("button", { name: "Save invoice details" }).click();
  await expect(page.getByText("Saved. New invoices will use these details.")).toBeVisible();

  // A paid deal. The form keeps what was typed when validation fails.
  await page.getByRole("link", { name: "Deals" }).click();
  await page.getByRole("link", { name: "New deal" }).click();
  await page.getByLabel("Deal name").fill("Winter reel");
  await page.getByLabel("Brand", { exact: true }).fill("Snowy Skincare");
  await page.getByLabel("Fee (₹, before GST)").fill("abc");
  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page.getByText("Enter an amount in rupees")).toBeVisible();
  await expect(page.getByLabel("Deal name")).toHaveValue("Winter reel");
  await page.getByLabel("Fee (₹, before GST)").fill("40,000");
  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page.getByRole("heading", { name: "Winter reel" })).toBeVisible();

  // Invoice it: same state, so CGST + SGST.
  await page.getByRole("button", { name: "Create invoice" }).click();
  await page.getByRole("button", { name: "Create invoice" }).last().click();
  await expect(page.getByRole("heading", { name: /\/2026-27\/001|\/20\d\d-\d\d\/001/ })).toBeVisible();
  await expect(page.getByText("₹47,200").first()).toBeVisible(); // 40,000 + 18% GST

  // Paid in full, with 10% TDS deducted by the brand.
  await expect(page.getByLabel("Amount received (₹)")).toHaveValue("43200");
  await expect(page.getByLabel("TDS deducted by the brand (₹)")).toHaveValue("4000");
  await page.getByRole("button", { name: "Record payment" }).click();
  // Next keeps recently visited pages mounted (hidden), so only match what's visible.
  await expect(page.getByRole("row", { name: "Outstanding ₹0" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);

  // The dashboard reflects it.
  await page.getByRole("link", { name: "Home", exact: true }).click(); // bottom tab bar at phone width
  const stats = page.getByRole("region", { name: "Key numbers" }).filter({ visible: true });
  await expect(stats.getByText("₹47,200").first()).toBeVisible();
  await expect(page.getByText("TDS deducted by brands").filter({ visible: true })).toBeVisible();
});

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/deals");
  await expect(page).toHaveURL(/\/login/);
});
