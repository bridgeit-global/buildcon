import { test, expect } from '@playwright/test';

test.describe('projects', () => {
  test('loads projects list shell', async ({ page }) => {
    await page.goto('/crm/project');
    await expect(page).toHaveURL(/\/crm\/project/);
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });
});
