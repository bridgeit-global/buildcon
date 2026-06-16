import { test, expect } from '@playwright/test';

test.describe('bookings', () => {
  test('loads booking management shell', async ({ page }) => {
    await page.goto('/crm/bookings');
    await expect(page).toHaveURL(/\/crm\/bookings/);
    await expect(page.getByText('Booking management')).toBeVisible();
  });
});
