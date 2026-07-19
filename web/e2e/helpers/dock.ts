import type { Page } from '@playwright/test';

export type DockTab = 'properties' | 'flows' | 'yaml';

/** Switches the right dock's active tab (PLAN.md step 10.4) — Links and
 * Flows content isn't mounted unless their tab is active. */
export async function openDock(page: Page, tab: DockTab) {
  await page.getByTestId(`dock-tab-${tab}`).click();
}
