import { test, expect } from '@playwright/test';

test.describe('inquiry', () => {
  test('loads enquiries overview shell', async ({ page }) => {
    await page.goto('/crm/inquiry');
    await expect(page).toHaveURL(/\/crm\/inquiry/);
    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible();
    await expect.soft(page.getByRole('link', { name: /add enquiry/i })).toBeVisible();
  });
});
