import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    setup.skip(
      true,
      'E2E_USER_EMAIL and E2E_USER_PASSWORD must be set in .env.local'
    );
    return;
  }

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await expect(page).toHaveURL(/\/crm/);
  await page.context().storageState({ path: authFile });
});
