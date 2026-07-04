/** Feature flags (PLAN3.md step 11.3): switches for functionality that's
 * implemented and tested but not yet ready to expose in the menu. Flip a
 * flag to `true` to bring the feature back — the code and its tests stay
 * in place either way. */
export const featureFlags = {
  /** draw.io import (PLAN.md step 10.10): hidden pending a follow-up pass
   * on import fidelity (PLAN3.md step 11.3 decision). */
  drawioImport: false,
};
