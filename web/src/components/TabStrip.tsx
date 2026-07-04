import type { DiagramLevel } from '../hooks/useDiagramStack';

interface TabStripProps {
  openTabs: string[];
  activeTab: string | null;
  mainFileName: string | null;
  levels: Record<string, DiagramLevel>;
  tabErrors: Record<string, string>;
  onSwitchTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
}

/** The strip of open diagram tabs above the canvas (PLAN3.md step
 * 11.7): the main file plus every `details:` sub-diagram reachable from
 * it, eagerly parsed at load time so switching between them is instant.
 * Only non-main tabs are closable; a tab whose file failed to parse
 * shows an error marker instead of a title. */
export function TabStrip({ openTabs, activeTab, mainFileName, levels, tabErrors, onSwitchTab, onCloseTab }: TabStripProps) {
  if (openTabs.length === 0) return null;
  return (
    <div
      data-testid="tab-strip"
      style={{
        display: 'flex',
        overflowX: 'auto',
        borderBottom: '1px solid var(--dc-border)',
        background: 'var(--dc-surface)',
        flex: '0 0 auto',
      }}
    >
      {openTabs.map((fileName) => {
        const level = levels[fileName];
        const hasError = Boolean(tabErrors[fileName]);
        const isActive = fileName === activeTab;
        const unsaved = level ? level.rawText !== level.savedRawText : false;
        const title = level?.diagram.diagram.title ?? fileName;
        return (
          <div
            key={fileName}
            data-testid={`tab-${fileName}`}
            data-active={isActive || undefined}
            onClick={() => onSwitchTab(fileName)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--dc-space-1)',
              padding: 'var(--dc-space-1) var(--dc-space-2)',
              borderBottom: isActive ? '2px solid var(--dc-accent)' : '2px solid transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 'var(--dc-font-size-sm)',
              color: hasError ? 'var(--dc-danger, #c0392b)' : 'var(--dc-text)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '0 0 auto',
            }}
          >
            <span>
              {hasError ? '⚠ ' : ''}
              {title}
              {unsaved ? ' •' : ''}
            </span>
            {fileName !== mainFileName && (
              <button
                type="button"
                data-testid={`tab-close-${fileName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(fileName);
                }}
                title="Close tab"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  padding: 0,
                  fontSize: 'var(--dc-font-size-sm)',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
