import type { Page } from '@playwright/test';

export type MenuName = 'file' | 'edit' | 'view' | 'arrange' | 'help';

/** Opens a top-level menubar menu (PLAN.md step 10.3) before interacting
 * with an item inside it — every action that used to be a flat header
 * button now lives behind one of these. */
export async function openMenu(page: Page, menu: MenuName) {
  await page.getByTestId(`menu-trigger-${menu}`).click();
}
