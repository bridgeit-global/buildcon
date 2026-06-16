import { test, expect } from '@playwright/test';

test.describe('financials', () => {
  test('loads collections page shell', async ({ page }) => {
    await page.goto('/crm/financials');
    await expect(page).toHaveURL(/\/crm\/financials/);
    await expect(
      page.getByRole('heading', { name: /Collections & accounts/i })
    ).toBeVisible();
  });
});
