import type { ReactNode } from 'react';

export type RightDockTab = 'properties' | 'links' | 'flows' | 'yaml';

const TABS: { id: RightDockTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'links', label: 'Links' },
  { id: 'flows', label: 'Flows' },
  { id: 'yaml', label: 'YAML' },
];

interface RightDockProps {
  tab: RightDockTab;
  onTabChange: (tab: RightDockTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  propertiesContent: ReactNode;
  linksContent: ReactNode;
  flowsContent: ReactNode;
  yamlContent: ReactNode;
}

/** Right-hand dock (PLAN.md step 10.4): tabbed Properties/Links/Flows,
 * collapsible with the choice persisted (`dc.ui.rightDock`). */
export function RightDock({
  tab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  propertiesContent,
  linksContent,
  flowsContent,
  yamlContent,
}: RightDockProps) {
  return (
    <aside
      data-testid="right-dock"
      style={{
        width: collapsed ? 'auto' : tab === 'yaml' ? 420 : 300,
        borderLeft: '1px solid var(--dc-border)',
        background: 'var(--dc-surface)',
        color: 'var(--dc-text)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: collapsed ? 'none' : '1px solid var(--dc-border)',
        }}
      >
        <button
          type="button"
          data-testid="right-dock-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--dc-space-2)', color: 'var(--dc-text)' }}
        >
          {collapsed ? '«' : '»'}
        </button>
        {!collapsed &&
          TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`dock-tab-${t.id}`}
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--dc-accent)' : '2px solid transparent',
                cursor: 'pointer',
                padding: 'var(--dc-space-2) var(--dc-space-3)',
                fontWeight: tab === t.id ? 600 : 400,
                color: 'var(--dc-text)',
                fontSize: 'var(--dc-font-size-base)',
              }}
            >
              {t.label}
            </button>
          ))}
      </div>
      {!collapsed && (
        <div data-testid="right-dock-content" style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'properties' && propertiesContent}
          {tab === 'links' && linksContent}
          {tab === 'flows' && flowsContent}
          {tab === 'yaml' && yamlContent}
        </div>
      )}
    </aside>
  );
}
