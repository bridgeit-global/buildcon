import { test, expect } from '@playwright/test';

test.describe('possession', () => {
  test('loads possession and handover shell', async ({ page }) => {
    await page.goto('/crm/possession');
    await expect(page).toHaveURL(/\/crm\/possession/);
    await expect(
      page.getByRole('heading', { name: /Possession & handover/i })
    ).toBeVisible();
  });
});
