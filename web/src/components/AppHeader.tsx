import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Maximize2, Minimize2, Moon, RefreshCw, Redo2, Sun, Undo2 } from 'lucide-react';
import { MenuBar } from './MenuBar';
import type { MenuSpec } from './MenuBar';
import { BLANK_TEMPLATE } from './StartScreen';
import type { Theme } from '../hooks/useTheme';
import type { DiagramLevel } from '../hooks/useDiagramStack';
import { featureFlags } from '../featureFlags';

interface AppHeaderProps {
  theme: Theme;
  toggleTheme: () => void;
  onFileInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenNative: (fallback: () => void) => void;
  onNewDiagram: (text: string) => void;
  current: DiagramLevel | null;
  hasUnsavedChanges: boolean;
  saveStatus: 'saved' | 'draft' | 'unsaved';
  draftSavedAt?: number;
  autoSaveToFile: boolean;
  onToggleAutoSaveToFile: () => void;
  onSave: () => void;
  onExportLayout: () => void;
  onImportLayout: (e: ChangeEvent<HTMLInputElement>) => void;
  onExportImage: () => void;
  onExportFlowStepsZip: () => void;
  onExportContext: () => void;
  onShare: () => void;
  shareUrl: string | null;
  shareError: string | null;
  onRelayout: () => void;
  onRelayoutAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  historyCounts: { past: number; future: number };
  breadcrumbLevels: DiagramLevel[];
  onBreadcrumbClick: (fileName: string) => void;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  onDeleteSelectedNode: () => void;
  onDuplicateSelectedNodes: () => void;
  onZOrderOp: (op: 'front' | 'forward' | 'backward' | 'back') => void;
  canGroupSelected: boolean;
  canUngroupSelected: boolean;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onShowTour: () => void;
  grid: boolean;
  onToggleGrid: () => void;
  snap: boolean;
  onToggleSnap: () => void;
  showDescriptions: boolean;
  onToggleShowDescriptions: () => void;
  showEdgeLabels: boolean;
  onToggleShowEdgeLabels: () => void;
  coreView: boolean;
  onToggleCoreView: () => void;
  renderStyle: 'clean' | 'sketch';
  onToggleRenderStyle: () => void;
  onImportDrawio: (file: File) => void;
}

const REPO_URL = 'https://github.com/oleksii-mykhniak/diagramcore';

/** `HH:MM`, 24-hour, no locale dependence (PLAN4.md step 12.3's `Draft ·
 * autosaved HH:MM` badge) — deterministic across test environments,
 * unlike `toLocaleTimeString`. */
function formatClockTime(ms: number | undefined): string {
  if (ms === undefined) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--dc-text)',
  padding: 'var(--dc-space-1)',
  borderRadius: 'var(--dc-radius-sm)',
};

/** The app's header: row 1 is the menubar (File/Edit/View/Arrange/Help,
 * self-written — PLAN.md step 10.3); row 2 is a thin icon toolbar +
 * breadcrumbs. Every action from the pre-10.3 flat button row is reachable
 * from here under its original testid — either as a menu item (`save`,
 * `export-png`, `export-layout`, `layout-input`, `export-context`,
 * `export-flow-steps-zip`, `share`, `open-native`) or as a toolbar icon
 * (`undo`, `redo`, `relayout`, `theme-toggle`). */
export function AppHeader({
  theme,
  toggleTheme,
  onFileInput,
  onOpenNative,
  onNewDiagram,
  current,
  hasUnsavedChanges,
  saveStatus,
  draftSavedAt,
  autoSaveToFile,
  onToggleAutoSaveToFile,
  onSave,
  onExportLayout,
  onImportLayout,
  onExportImage,
  onExportFlowStepsZip,
  onExportContext,
  onShare,
  shareUrl,
  shareError,
  onRelayout,
  onRelayoutAll,
  onUndo,
  onRedo,
  historyCounts,
  breadcrumbLevels,
  onBreadcrumbClick,
  selectedNodeId,
  selectedNodeIds,
  onDeleteSelectedNode,
  onDuplicateSelectedNodes,
  onZOrderOp,
  canGroupSelected,
  canUngroupSelected,
  onGroupSelected,
  onUngroupSelected,
  onShowTour,
  grid,
  onToggleGrid,
  snap,
  onToggleSnap,
  showDescriptions,
  onToggleShowDescriptions,
  showEdgeLabels,
  coreView,
  onToggleCoreView,
  onToggleShowEdgeLabels,
  renderStyle,
  onToggleRenderStyle,
  onImportDrawio,
}: AppHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const menus: MenuSpec[] = [
    {
      label: 'File',
      testId: 'file',
      items: [
        { label: 'New', onSelect: () => onNewDiagram(BLANK_TEMPLATE) },
        { label: 'Open', testId: 'open-native', onSelect: () => onOpenNative(() => fileInputRef.current?.click()) },
        { label: `Save${hasUnsavedChanges ? ' •' : ''}`, testId: 'save', onSelect: onSave, disabled: !current },
        {
          label: `Auto-save to file: ${autoSaveToFile ? 'on' : 'off'}`,
          testId: 'menu-auto-save-to-file-toggle',
          onSelect: onToggleAutoSaveToFile,
        },
        {
          label: 'Import layout',
          disabled: !current,
          render: (close) => (
            <label style={{ display: 'block', padding: 'var(--dc-space-2) var(--dc-space-3)', cursor: current ? 'pointer' : 'default' }}>
              Import layout
              <input
                type="file"
                accept=".json"
                data-testid="layout-input"
                disabled={!current}
                style={{ display: 'block' }}
                onChange={(e) => {
                  onImportLayout(e);
                  close();
                }}
              />
            </label>
          ),
        },
        ...(featureFlags.drawioImport
          ? [
              {
                label: 'Import draw.io…',
                render: (close: () => void) => (
                  <label style={{ display: 'block', padding: 'var(--dc-space-2) var(--dc-space-3)', cursor: 'pointer' }}>
                    Import draw.io…
                    <input
                      type="file"
                      accept=".drawio,.xml,.svg"
                      data-testid="drawio-input"
                      style={{ display: 'block' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onImportDrawio(file);
                        e.target.value = '';
                        close();
                      }}
                    />
                  </label>
                ),
              },
            ]
          : []),
        { label: 'Export image…', testId: 'export-png', onSelect: onExportImage, disabled: !current },
        { label: 'Export layout', testId: 'export-layout', onSelect: onExportLayout, disabled: !current },
        {
          label: 'Export flow steps (zip)',
          testId: 'export-flow-steps-zip',
          onSelect: onExportFlowStepsZip,
          disabled: !current || current.flowPlayerState.flowIndex === null,
        },
        { label: 'Export AI context (markdown)', testId: 'export-context', onSelect: onExportContext, disabled: !current },
        { label: 'Share', testId: 'share', onSelect: onShare, disabled: !current },
      ],
    },
    {
      label: 'Edit',
      testId: 'edit',
      items: [
        { label: 'Undo', testId: 'menu-undo', onSelect: onUndo, disabled: historyCounts.past === 0 },
        { label: 'Redo', testId: 'menu-redo', onSelect: onRedo, disabled: historyCounts.future === 0 },
        {
          label: selectedNodeIds.length > 1 ? `Delete ${selectedNodeIds.length} nodes` : 'Delete node',
          testId: 'menu-delete-node',
          onSelect: onDeleteSelectedNode,
          disabled: selectedNodeIds.length === 0 && !selectedNodeId,
        },
        {
          label: selectedNodeIds.length > 1 ? `Duplicate ${selectedNodeIds.length} nodes` : 'Duplicate node',
          testId: 'menu-duplicate-node',
          onSelect: onDuplicateSelectedNodes,
          disabled: selectedNodeIds.length === 0 && !selectedNodeId,
        },
        {
          label: 'Bring to front',
          testId: 'menu-bring-to-front',
          onSelect: () => onZOrderOp('front'),
          disabled: selectedNodeIds.length === 0 && !selectedNodeId,
        },
        {
          label: 'Bring forward',
          testId: 'menu-bring-forward',
          onSelect: () => onZOrderOp('forward'),
          disabled: selectedNodeIds.length === 0 && !selectedNodeId,
        },
        {
          label: 'Send backward',
          testId: 'menu-send-backward',
          onSelect: () => onZOrderOp('backward'),
          disabled: selectedNodeIds.length === 0 && !selectedNodeId,
        },
        {
          label: 'Send to back',
          testId: 'menu-send-to-back',
          onSelect: () => onZOrderOp('back'),
          disabled: selectedNodeIds.length === 0 && !selectedNodeId,
        },
        { label: 'Group', testId: 'menu-group', onSelect: onGroupSelected, disabled: !canGroupSelected },
        { label: 'Ungroup', testId: 'menu-ungroup', onSelect: onUngroupSelected, disabled: !canUngroupSelected },
      ],
    },
    {
      label: 'View',
      testId: 'view',
      items: [
        {
          label: theme === 'light' ? 'Dark mode' : 'Light mode',
          testId: 'menu-theme-toggle',
          onSelect: toggleTheme,
        },
        {
          label: isFullscreen ? 'Exit fullscreen' : 'Fullscreen',
          testId: 'menu-fullscreen',
          onSelect: () => {
            toggleFullscreen();
            setIsFullscreen((f) => !f);
          },
        },
        { label: grid ? 'Grid: on' : 'Grid: off', testId: 'menu-grid-toggle', onSelect: onToggleGrid },
        { label: snap ? 'Snap to grid: on' : 'Snap to grid: off', testId: 'menu-snap-toggle', onSelect: onToggleSnap },
        {
          label: showDescriptions ? 'Show descriptions: on' : 'Show descriptions: off',
          testId: 'menu-show-descriptions-toggle',
          onSelect: onToggleShowDescriptions,
        },
        {
          label: showEdgeLabels ? 'Connection labels: shown' : 'Connection labels: hidden',
          testId: 'menu-show-edge-labels-toggle',
          onSelect: onToggleShowEdgeLabels,
        },
        {
          label: coreView ? 'Core view: on' : 'Core view: off',
          testId: 'menu-core-view-toggle',
          onSelect: onToggleCoreView,
        },
        {
          label: `Diagram style: ${renderStyle === 'sketch' ? 'Sketch' : 'Clean'}`,
          testId: 'menu-render-style-toggle',
          onSelect: onToggleRenderStyle,
          disabled: !current,
        },
      ],
    },
    {
      label: 'Arrange',
      testId: 'arrange',
      items: [
        { label: 'Re-layout', testId: 'menu-relayout', onSelect: onRelayout, disabled: !current },
        { label: 'Re-layout all', testId: 'menu-relayout-all', onSelect: onRelayoutAll, disabled: !current },
      ],
    },
    {
      label: 'Help',
      testId: 'help',
      items: [
        { label: 'Tour', testId: 'menu-tour', onSelect: onShowTour },
        {
          render: (close) => (
            <a
              href={`${REPO_URL}/blob/main/docs/format.md`}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={close}
              style={{ display: 'block', padding: 'var(--dc-space-2) var(--dc-space-3)', color: 'var(--dc-text)' }}
            >
              Format docs
            </a>
          ),
          label: 'Format docs',
        },
        {
          render: (close) => (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={close}
              style={{ display: 'block', padding: 'var(--dc-space-2) var(--dc-space-3)', color: 'var(--dc-text)' }}
            >
              GitHub
            </a>
          ),
          label: 'GitHub',
        },
      ],
    },
  ];

  return (
    <header
      style={{
        borderBottom: '1px solid var(--dc-border)',
        background: 'var(--dc-surface)',
        color: 'var(--dc-text)',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml"
        multiple
        data-testid="file-input"
        onChange={onFileInput}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--dc-space-3)', padding: '2px var(--dc-space-3) 0' }}>
        <h1 style={{ fontSize: 'var(--dc-font-size-lg)', margin: 0 }}>DiagramCore</h1>
        <MenuBar menus={menus} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--dc-space-2)',
          padding: 'var(--dc-space-1) var(--dc-space-3)',
          borderTop: '1px solid var(--dc-border)',
        }}
      >
        <button type="button" data-testid="undo" title="Undo" onClick={onUndo} disabled={historyCounts.past === 0} style={iconButtonStyle}>
          <Undo2 size={16} />
        </button>
        <button type="button" data-testid="redo" title="Redo" onClick={onRedo} disabled={historyCounts.future === 0} style={iconButtonStyle}>
          <Redo2 size={16} />
        </button>
        <button type="button" data-testid="relayout" title="Re-layout" onClick={onRelayout} disabled={!current} style={iconButtonStyle}>
          <RefreshCw size={16} />
        </button>
        <button
          type="button"
          data-testid="fullscreen-toggle"
          title="Fullscreen"
          onClick={() => {
            toggleFullscreen();
            setIsFullscreen((f) => !f);
          }}
          style={iconButtonStyle}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button type="button" data-testid="theme-toggle" title="Toggle theme" onClick={toggleTheme} style={iconButtonStyle}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {hasUnsavedChanges && (
          <span data-testid="unsaved-indicator">
            {saveStatus === 'draft' ? `Draft · autosaved ${formatClockTime(draftSavedAt)}` : 'Unsaved changes'}
          </span>
        )}
        {saveStatus === 'saved' && current && (
          <span data-testid="saved-indicator" style={{ color: 'var(--dc-text-muted)' }}>
            Saved
          </span>
        )}
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
        {breadcrumbLevels.length > 0 && (
          <nav data-testid="breadcrumbs">
            {breadcrumbLevels.map((level, i) => (
              <span key={`${level.fileName}-${i}`}>
                {i > 0 && ' › '}
                {i === breadcrumbLevels.length - 1 ? (
                  <strong data-testid={`breadcrumb-${i}`}>{level.diagram.diagram.title}</strong>
                ) : (
                  <button
                    type="button"
                    data-testid={`breadcrumb-${i}`}
                    onClick={() => onBreadcrumbClick(level.fileName)}
                    style={{ background: 'none', border: 'none', color: 'var(--dc-accent)', cursor: 'pointer', padding: 0 }}
                  >
                    {level.diagram.diagram.title}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
