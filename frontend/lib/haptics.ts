// ==========================================
// Utility: Native Haptics Bridge
// ==========================================
type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';
const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 30, 20],
  error: [20, 40, 20, 40, 30]
};

export const triggerHaptic = (pattern: HapticPattern = 'light'): void => {
  if (typeof window === 'undefined' || !window.navigator || !window.navigator.vibrate) return;
  try {
    window.navigator.vibrate(PATTERNS[pattern]);
  } catch (error) {
    console.warn('[AURA Haptics] Execution suppressed by browser policy.');
  }
};
