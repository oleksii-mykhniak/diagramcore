import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface MenuItemSpec {
  label: string;
  testId?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Renders a custom element instead of a plain button — used for the
   * "Import layout" item, which must stay a real file input for e2e's
   * `setInputFiles`. Takes precedence over `onSelect`. */
  render?: (close: () => void) => ReactNode;
}

export interface MenuSpec {
  label: string;
  testId: string;
  items: MenuItemSpec[];
}

const itemStyle = (disabled?: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 'var(--dc-space-2) var(--dc-space-3)',
  cursor: disabled ? 'default' : 'pointer',
  color: disabled ? 'var(--dc-text-muted)' : 'var(--dc-text)',
  fontSize: 'var(--dc-font-size-base)',
  whiteSpace: 'nowrap',
});

/** Self-written draw.io-style menubar (PLAN.md step 10.3): ARIA
 * menubar/menu/menuitem, click-to-open, hover-to-switch while a menu is
 * open, Escape/click-outside to close, arrow-key navigation within an
 * open menu. No menu library — five flat, submenu-free menus don't
 * justify one. */
export function MenuBar({ menus }: { menus: MenuSpec[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = () => setOpenIndex(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [openIndex]);

  useEffect(() => {
    if (openIndex === null) return;
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    firstItem?.focus();
  }, [openIndex]);

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenIndex(index);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>, index: number) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      triggerRefs.current[index]?.focus();
    }
  }

  return (
    <div ref={rootRef} role="menubar" aria-label="Main menu" data-testid="menubar" style={{ display: 'flex', gap: 2 }}>
      {menus.map((menu, i) => (
        <div key={menu.testId} style={{ position: 'relative' }}>
          <button
            type="button"
            ref={(el) => {
              triggerRefs.current[i] = el;
            }}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openIndex === i}
            data-testid={`menu-trigger-${menu.testId}`}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            onMouseEnter={() => {
              if (openIndex !== null && openIndex !== i) setOpenIndex(i);
            }}
            onKeyDown={(e) => onTriggerKeyDown(e, i)}
            style={{
              background: openIndex === i ? 'var(--dc-surface-muted)' : 'none',
              border: 'none',
              padding: 'var(--dc-space-1) var(--dc-space-3)',
              cursor: 'pointer',
              color: 'var(--dc-text)',
              fontSize: 'var(--dc-font-size-base)',
            }}
          >
            {menu.label}
          </button>
          {openIndex === i && (
            <div
              ref={menuRef}
              role="menu"
              aria-label={menu.label}
              data-testid={`menu-${menu.testId}`}
              onKeyDown={(e) => onMenuKeyDown(e, i)}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                minWidth: 200,
                background: 'var(--dc-surface)',
                border: '1px solid var(--dc-border)',
                borderRadius: 'var(--dc-radius-md)',
                boxShadow: 'var(--dc-shadow)',
                padding: 'var(--dc-space-1) 0',
                zIndex: 20,
              }}
            >
              {menu.items.map((item, j) =>
                item.render ? (
                  <div key={j}>{item.render(close)}</div>
                ) : (
                  <button
                    key={j}
                    type="button"
                    role="menuitem"
                    data-testid={item.testId}
                    disabled={item.disabled}
                    onClick={() => {
                      item.onSelect?.();
                      close();
                    }}
                    style={itemStyle(item.disabled)}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
