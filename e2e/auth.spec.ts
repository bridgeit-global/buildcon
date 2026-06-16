import { test, expect } from '@playwright/test';

test.describe('unauthenticated access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects CRM routes to login', async ({ page }) => {
    await page.goto('/crm/dashboard');
    await expect(page).toHaveURL(/\/?(\?redirectTo=|$)/);
    await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
  });
});
