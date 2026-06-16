import { test, expect } from '@playwright/test';

test.describe('inventory', () => {
  test('loads inventory page shell', async ({ page }) => {
    await page.goto('/crm/inventory');
    await expect(page).toHaveURL(/\/crm\/inventory/);
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });
});
