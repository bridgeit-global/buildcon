import { test, expect } from '@playwright/test';

test.describe('dashboard', () => {
  test('loads dashboard shell', async ({ page }) => {
    await page.goto('/crm/dashboard');
    await expect(page).toHaveURL(/\/crm\/dashboard/);
    await expect(page.getByText('Total Inventory')).toBeVisible();
    await expect.soft(page.getByText('Booked Units')).toBeVisible();
  });
});
