import { test, expect } from '@playwright/test';

test.describe('documents', () => {
  test('loads confirmed bookings documents shell', async ({ page }) => {
    await page.goto('/crm/documents');
    await expect(page).toHaveURL(/\/crm\/documents/);
    await expect(
      page.getByRole('heading', { name: 'Confirmed bookings' })
    ).toBeVisible();
  });
});
