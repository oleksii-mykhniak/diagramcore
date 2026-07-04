import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { Theme } from '../hooks/useTheme';
import type { DiagramLevel } from '../hooks/useDiagramStack';

interface AppHeaderProps {
  theme: Theme;
  toggleTheme: () => void;
  onFileInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenNative: (fallback: () => void) => void;
  current: DiagramLevel | null;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onExportLayout: () => void;
  onImportLayout: (e: ChangeEvent<HTMLInputElement>) => void;
  onExportPng: () => void;
  onExportFlowStepsZip: () => void;
  onExportContext: () => void;
  onShare: () => void;
  shareUrl: string | null;
  shareError: string | null;
  onRelayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  historyCounts: { past: number; future: number };
  stack: DiagramLevel[];
  goToLevel: (index: number) => void;
}

/** The app's header row: temporary flat toolbar (menubar/toolbar arrive
 * in step 10.3) plus breadcrumbs for drill-down navigation. Carries the
 * previous App.tsx header byte-for-byte, including all its testids. */
export function AppHeader({
  theme,
  toggleTheme,
  onFileInput,
  onOpenNative,
  current,
  hasUnsavedChanges,
  onSave,
  onExportLayout,
  onImportLayout,
  onExportPng,
  onExportFlowStepsZip,
  onExportContext,
  onShare,
  shareUrl,
  shareError,
  onRelayout,
  onUndo,
  onRedo,
  historyCounts,
  stack,
  goToLevel,
}: AppHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header
      style={{
        padding: 'var(--dc-space-2) var(--dc-space-4)',
        borderBottom: '1px solid var(--dc-border)',
        background: 'var(--dc-surface)',
        color: 'var(--dc-text)',
      }}
    >
      <h1 style={{ fontSize: 'var(--dc-font-size-lg)', margin: '0 0 8px' }}>DiagramCore</h1>
      <button type="button" data-testid="theme-toggle" onClick={toggleTheme}>
        {theme === 'light' ? 'Dark mode' : 'Light mode'}
      </button>{' '}
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml"
        multiple
        data-testid="file-input"
        onChange={onFileInput}
      />{' '}
      <button
        type="button"
        data-testid="open-native"
        onClick={() => onOpenNative(() => fileInputRef.current?.click())}
      >
        Open
      </button>{' '}
      {current && (
        <>
          <button type="button" data-testid="save" onClick={onSave}>
            Save{hasUnsavedChanges ? ' •' : ''}
          </button>{' '}
          {hasUnsavedChanges && <span data-testid="unsaved-indicator">Unsaved changes</span>}
        </>
      )}
      {current && (
        <>
          {' '}
          <button type="button" data-testid="export-layout" onClick={onExportLayout}>
            Export layout
          </button>{' '}
          <label>
            Import layout:{' '}
            <input type="file" accept=".json" data-testid="layout-input" onChange={onImportLayout} />
          </label>{' '}
          <button type="button" data-testid="export-png" onClick={onExportPng}>
            Export PNG
          </button>{' '}
          <button
            type="button"
            data-testid="export-flow-steps-zip"
            onClick={onExportFlowStepsZip}
            disabled={current.flowPlayerState.flowIndex === null}
          >
            Export flow steps (zip)
          </button>{' '}
          <button type="button" data-testid="export-context" onClick={onExportContext}>
            Export AI context (markdown)
          </button>{' '}
          <button type="button" data-testid="share" onClick={onShare}>
            Share
          </button>{' '}
          {shareUrl && (
            <input
              data-testid="share-url"
              readOnly
              value={shareUrl}
              style={{ width: 320 }}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          {shareError && (
            <span role="alert" data-testid="share-error">
              {shareError}
            </span>
          )}
          <button type="button" data-testid="relayout" onClick={onRelayout}>
            Re-layout
          </button>{' '}
          <button type="button" data-testid="undo" onClick={onUndo} disabled={historyCounts.past === 0}>
            Undo
          </button>{' '}
          <button type="button" data-testid="redo" onClick={onRedo} disabled={historyCounts.future === 0}>
            Redo
          </button>
        </>
      )}
      {stack.length > 0 && (
        <nav data-testid="breadcrumbs" style={{ marginTop: 8 }}>
          {stack.map((level, i) => (
            <span key={`${level.fileName}-${i}`}>
              {i > 0 && ' › '}
              {i === stack.length - 1 ? (
                <strong data-testid={`breadcrumb-${i}`}>{level.diagram.diagram.title}</strong>
              ) : (
                <button
                  type="button"
                  data-testid={`breadcrumb-${i}`}
                  onClick={() => goToLevel(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--dc-accent)', cursor: 'pointer', padding: 0 }}
                >
                  {level.diagram.diagram.title}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
    </header>
  );
}
