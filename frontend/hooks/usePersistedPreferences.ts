// ============================================================================
// usePersistedPreferences — Loads and persists user preferences
//
// For authenticated users: reads/writes Spanner via dataService.
// For anonymous users: falls back to localStorage.
// Debounces writes to avoid hammering the API on rapid mode switches.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import * as dataService from '../services/dataService';
import type { UserPreferences } from '../types/persistence';
import type { ChatMode, ThinkingMode } from './useChat';

interface PersistedPreferencesReturn {
  /** Whether preferences have been loaded (avoids flash of default state). */
  isLoaded: boolean;
  /** Whether the user is authenticated (Spanner persistence active). */
  isAuthenticated: boolean;
  /** Current preferences (from Spanner or localStorage fallback). */
  preferences: UserPreferences;
  /** Persists a preference change. Debounced for rapid changes. */
  updatePreference: (key: keyof UserPreferences, value: string) => void;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  chatMode: 'operator',
  thinkingMode: 'fast',
  theme: 'light',
};

const LOCAL_STORAGE_KEY = 'clearspace_preferences';

/** Reads preferences from localStorage (anonymous fallback). */
function readLocalPrefs(): UserPreferences {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch { /* ignore parse errors */ }
  return { ...DEFAULT_PREFERENCES };
}

/** Writes preferences to localStorage (anonymous fallback). */
function writeLocalPrefs(prefs: UserPreferences): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore quota errors */ }
}

export function usePersistedPreferences(): PersistedPreferencesReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending writes accumulator
  const pendingRef = useRef<Partial<UserPreferences>>({});

  // --- Load on mount + anonymous→authenticated migration ---
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const authed = await dataService.isAuthenticated();
        if (cancelled) return;
        setIsAuthed(authed);

        if (authed) {
          const serverPrefs = await dataService.getPreferences();
          const localPrefs = readLocalPrefs();
          if (!cancelled) {
            // Migration: if Spanner has defaults but localStorage has user changes,
            // push the local prefs to Spanner (first sign-in after anonymous use).
            const serverIsDefault =
              serverPrefs.chatMode === 'standard' &&
              serverPrefs.thinkingMode === 'fast' &&
              serverPrefs.theme === 'light';

            const localHasChanges =
              localPrefs.chatMode !== DEFAULT_PREFERENCES.chatMode ||
              localPrefs.thinkingMode !== DEFAULT_PREFERENCES.thinkingMode ||
              localPrefs.theme !== DEFAULT_PREFERENCES.theme;

            if (serverIsDefault && localHasChanges) {
              // Migrate localStorage prefs → Spanner
              await dataService.updatePreferences(localPrefs).catch(() => {});
              setPreferences(localPrefs);
              writeLocalPrefs(localPrefs);
            } else {
              // Server wins — use Spanner prefs
              setPreferences(serverPrefs);
              writeLocalPrefs(serverPrefs);
            }
          }
        } else {
          // Anonymous: use localStorage
          setPreferences(readLocalPrefs());
        }
      } catch (e) {
        // Network error — fall back to localStorage
        if (!cancelled) {
          setPreferences(readLocalPrefs());
        }
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // --- Debounced write ---
  const flushPending = useCallback(async () => {
    const pending = { ...pendingRef.current };
    pendingRef.current = {};

    if (Object.keys(pending).length === 0) return;

    if (isAuthed) {
      try {
        await dataService.updatePreferences(pending);
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Preferences] Failed to persist:', e);
        }
      }
    }
  }, [isAuthed]);

  // --- Update handler ---
  const updatePreference = useCallback((key: keyof UserPreferences, value: string) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value };
      writeLocalPrefs(next); // Always sync localStorage
      return next;
    });

    // Accumulate pending writes
    pendingRef.current[key] = value as any;

    // Debounce API call (500ms)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushPending, 500);
  }, [flushPending]);

  return {
    isLoaded,
    isAuthenticated: isAuthed,
    preferences,
    updatePreference,
  };
}
