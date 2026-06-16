import { test, expect } from '@playwright/test';

test.describe('approvals', () => {
  test('loads approvals page shell', async ({ page }) => {
    await page.goto('/crm/approvals');
    await expect(page).toHaveURL(/\/crm\/approvals/);
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  });
});
