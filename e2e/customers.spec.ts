import { test, expect } from '@playwright/test';

test.describe('customers', () => {
  test('loads customers page shell', async ({ page }) => {
    await page.goto('/crm/customers');
    await expect(page).toHaveURL(/\/crm\/customers/);
    await expect(page.getByText('Customers', { exact: true })).toBeVisible();
  });
});
