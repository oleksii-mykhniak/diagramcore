import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light with no stored value', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme updates data-theme and persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current[1]('dark');
    });
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('dc.theme')).toBe('dark');
  });

  it('toggleTheme flips between light and dark', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current[2]();
    });
    expect(result.current[0]).toBe('dark');
    act(() => {
      result.current[2]();
    });
    expect(result.current[0]).toBe('light');
  });

  it('reads previously stored theme on init', () => {
    localStorage.setItem('dc.theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('dark');
  });
});
