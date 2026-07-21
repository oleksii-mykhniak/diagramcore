import { useState } from 'react';
import type { DiagramLevel } from '../hooks/useDiagramStack';
import { levelHasUnsavedChanges } from '../hooks/useDiagramStack';

interface TabStripProps {
  openTabs: string[];
  activeTab: string | null;
  mainFileName: string | null;
  levels: Record<string, DiagramLevel>;
  tabErrors: Record<string, string>;
  onSwitchTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
  onRenameDiagram: (title: string) => void;
}

/** The strip of open diagram tabs above the canvas (PLAN3.md step
 * 11.7): the main file plus every `details:` sub-diagram reachable from
 * it, eagerly parsed at load time so switching between them is instant.
 * Only non-main tabs are closable; a tab whose file failed to parse
 * shows an error marker instead of a title. Double-clicking a tab's
 * title renames its diagram (`diagram.title` in the YAML, not the
 * filename) — the click that precedes the dblclick already switched the
 * active tab, so the rename always targets whichever tab is being
 * edited. */
export function TabStrip({ openTabs, activeTab, mainFileName, levels, tabErrors, onSwitchTab, onCloseTab, onRenameDiagram }: TabStripProps) {
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  if (openTabs.length === 0) return null;

  const commitRename = () => {
    setEditingTab(null);
    onRenameDiagram(editingValue);
  };

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
        const unsaved = level ? levelHasUnsavedChanges(level) : false;
        const title = level?.diagram.diagram.title ?? fileName;
        const isEditing = editingTab === fileName;
        return (
          <div
            key={fileName}
            data-testid={`tab-${fileName}`}
            data-active={isActive || undefined}
            onClick={() => onSwitchTab(fileName)}
            onDoubleClick={() => {
              if (hasError || !level) return;
              setEditingTab(fileName);
              setEditingValue(title);
            }}
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
            {isEditing ? (
              <input
                type="text"
                data-testid={`tab-rename-input-${fileName}`}
                value={editingValue}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingTab(null);
                  }
                }}
                style={{
                  font: 'inherit',
                  color: 'inherit',
                  background: 'var(--dc-bg)',
                  border: '1px solid var(--dc-accent)',
                  borderRadius: 'var(--dc-radius-sm, 3px)',
                  padding: '0 4px',
                  width: `${Math.max(6, editingValue.length + 1)}ch`,
                }}
              />
            ) : (
              <span title="Double-click to rename">
                {hasError ? '⚠ ' : ''}
                {title}
                {unsaved ? ' •' : ''}
              </span>
            )}
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
