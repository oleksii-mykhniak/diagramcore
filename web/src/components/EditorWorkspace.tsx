import { useEffect, useState } from 'react';
import { FlowCanvas } from './FlowCanvas';
import { FlowPlayer } from './FlowPlayer';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { LinksPanel } from './LinksPanel';
import { FlowEditorPanel } from './FlowEditorPanel';
import type { BranchTarget } from './FlowEditorPanel';
import { YamlPanel } from './YamlPanel';
import { StartScreen } from './StartScreen';
import { StatusBar } from './StatusBar';
import { RightDock } from './RightDock';
import type { RightDockTab } from './RightDock';
import type { ValidationError } from '../wasmValidate';
import type { DiagramNode, DiagramLink, DiagramNoteDef, Flow } from '../types';
import type { LayoutPosition } from '../layoutFile';
import { computeFlowHighlight } from '../flowPlayer';
import type { FlowPlayerState } from '../flowPlayer';
import type { DiagramLevel } from '../hooks/useDiagramStack';

interface EditorWorkspaceProps {
  loadError: string | null;
  drillError: string | null;
  importNotice: string | null;
  current: DiagramLevel | null;
  onSelectProblem: (error: ValidationError) => void;
  onFlowPlayerChange: (state: FlowPlayerState) => void;
  recordingFlow: Flow | null;
  recording: boolean;
  branchTarget: BranchTarget | null;
  onNewFlow: () => void;
  onToggleRecording: () => void;
  onAddBranch: () => void;
  onSwitchArm: () => void;
  onFinishBranch: () => void;
  onUpdateFlowStepNote: (atIndex: number, note: string) => void;
  onDeleteStep: (atIndex: number) => void;
  selectedNodeId: string | null;
  onNodeDragStop: (id: string, pos: LayoutPosition) => void;
  onNodeDoubleClick: (node: DiagramNode) => void;
  onNodeClick: (node: DiagramNode) => void;
  onDropNodeType: (type: string, pos: LayoutPosition) => void;
  onDropNoteType: (pos: LayoutPosition) => void;
  onNoteDrag: (id: string, pos: LayoutPosition) => void;
  onNoteDoubleClick: (note: DiagramNoteDef) => void;
  showDescriptions: boolean;
  onConnectNodes: (source: string, target: string) => void;
  hoveredLinkIndex: number | null;
  onEdgeHover: (index: number | null) => void;
  onEdgeClick: (index: number) => void;
  focusRequest: { kind: 'node'; id: string; nonce: number } | { kind: 'line'; line: number; nonce: number } | null;
  onUpdateSelectedNode: (patch: Partial<DiagramNode>) => void;
  onDeleteSelectedNode: () => void;
  onUpdateLink: (index: number, patch: Partial<DiagramLink>) => void;
  onDeleteLink: (index: number) => void;
  onCommitYamlText: (text: string) => void;
  onOpenExample: (fileName: string, text: string) => void;
  onNewDiagram: (text: string) => void;
  grid: boolean;
  snap: boolean;
  yamlPanelOpen: boolean;
  onToggleYamlPanel: () => void;
  yamlPanelHeight: number;
  onYamlPanelHeightChange: (height: number) => void;
}

const YAML_PANEL_COLLAPSED_HEIGHT = 33;

const RIGHT_DOCK_STORAGE_KEY = 'dc.ui.rightDock';

function readRightDockCollapsed(): boolean {
  try {
    return Boolean(JSON.parse(localStorage.getItem(RIGHT_DOCK_STORAGE_KEY) ?? '{}').collapsed);
  } catch {
    return false;
  }
}

/** The content of `<main>`: a CSS-grid workspace (left palette, center
 * canvas, right tabbed dock, bottom status bar — PLAN.md step 10.4)
 * plus the YAML panel below it. Selecting a node (canvas click or a
 * Problems-panel jump) always switches the right dock to Properties and
 * expands it, mirroring the old inline overlay's always-visible behavior. */
export function EditorWorkspace({
  loadError,
  drillError,
  importNotice,
  current,
  onSelectProblem,
  onFlowPlayerChange,
  recordingFlow,
  recording,
  branchTarget,
  onNewFlow,
  onToggleRecording,
  onAddBranch,
  onSwitchArm,
  onFinishBranch,
  onUpdateFlowStepNote,
  onDeleteStep,
  selectedNodeId,
  onNodeDragStop,
  onNodeDoubleClick,
  onNodeClick,
  onDropNodeType,
  onDropNoteType,
  onNoteDrag,
  onNoteDoubleClick,
  showDescriptions,
  onConnectNodes,
  hoveredLinkIndex,
  onEdgeHover,
  onEdgeClick,
  focusRequest,
  onUpdateSelectedNode,
  onDeleteSelectedNode,
  onUpdateLink,
  onDeleteLink,
  onCommitYamlText,
  onOpenExample,
  onNewDiagram,
  grid,
  snap,
  yamlPanelOpen,
  onToggleYamlPanel,
  yamlPanelHeight,
  onYamlPanelHeightChange,
}: EditorWorkspaceProps) {
  const highlight = current ? computeFlowHighlight(current.diagram, current.flowPlayerState) : null;
  const selectedNode = current?.diagram.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const [rightDockTab, setRightDockTab] = useState<RightDockTab>('properties');
  const [rightDockCollapsed, setRightDockCollapsed] = useState(readRightDockCollapsed);

  useEffect(() => {
    localStorage.setItem(RIGHT_DOCK_STORAGE_KEY, JSON.stringify({ collapsed: rightDockCollapsed }));
  }, [rightDockCollapsed]);

  useEffect(() => {
    if (!selectedNodeId) return;
    setRightDockTab('properties');
    setRightDockCollapsed(false);
  }, [selectedNodeId]);

  const onResizeHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = yamlPanelHeight;
    const onMouseMove = (moveEvent: MouseEvent) => {
      onYamlPanelHeightChange(startHeight - (moveEvent.clientY - startY));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {loadError && (
        <p role="alert" data-testid="load-error">
          {loadError}
        </p>
      )}
      {drillError && (
        <p role="alert" data-testid="drill-error">
          {drillError}
        </p>
      )}
      {importNotice && <p data-testid="import-notice">{importNotice}</p>}
      {current && (
        <>
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <Palette diagram={current.diagram} />
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <FlowCanvas
                diagram={current.diagram}
                layout={current.layout}
                positions={current.positions}
                onNodeDragStop={onNodeDragStop}
                onNodeDoubleClick={onNodeDoubleClick}
                onNodeClick={onNodeClick}
                selectedNodeId={selectedNodeId}
                onDropNodeType={onDropNodeType}
                onConnectNodes={onConnectNodes}
                hoveredLinkIndex={hoveredLinkIndex}
                onEdgeHover={onEdgeHover}
                onEdgeClick={onEdgeClick}
                focusNodeId={focusRequest?.kind === 'node' ? focusRequest.id : null}
                focusNonce={focusRequest?.nonce}
                activeStep={highlight?.activeStep ?? undefined}
                visitedStepKeys={highlight?.visitedStepKeys}
                showGrid={grid}
                snapToGridEnabled={snap}
                notes={current.diagram.notes}
                notePositions={current.notePositions}
                onNoteDrag={onNoteDrag}
                onNoteDoubleClick={onNoteDoubleClick}
                onDropNoteType={onDropNoteType}
                showDescriptions={showDescriptions}
                renderStyle={current.renderStyle}
              />
            </div>
            <RightDock
              tab={rightDockTab}
              onTabChange={setRightDockTab}
              collapsed={rightDockCollapsed}
              onToggleCollapsed={() => setRightDockCollapsed((c) => !c)}
              propertiesContent={
                selectedNode ? (
                  <PropertiesPanel node={selectedNode} diagram={current.diagram} onUpdate={onUpdateSelectedNode} onDelete={onDeleteSelectedNode} />
                ) : (
                  <p data-testid="properties-empty" style={{ padding: 'var(--dc-space-3)', color: 'var(--dc-text-muted)' }}>
                    Select a node to edit its properties.
                  </p>
                )
              }
              linksContent={
                <LinksPanel
                  links={current.diagram.links}
                  hoveredLinkIndex={hoveredLinkIndex}
                  onHoverLink={onEdgeHover}
                  onUpdateLink={onUpdateLink}
                  onDeleteLink={onDeleteLink}
                />
              }
              flowsContent={
                <>
                  <FlowPlayer diagram={current.diagram} state={current.flowPlayerState} onChange={onFlowPlayerChange} />
                  <FlowEditorPanel
                    flow={recordingFlow}
                    recording={recording}
                    branchTarget={branchTarget}
                    onNewFlow={onNewFlow}
                    onToggleRecording={onToggleRecording}
                    onAddBranch={onAddBranch}
                    onSwitchArm={onSwitchArm}
                    onFinishBranch={onFinishBranch}
                    onUpdateStepNote={onUpdateFlowStepNote}
                    onDeleteStep={onDeleteStep}
                  />
                </>
              }
            />
          </div>
          <StatusBar
            errors={current.errors}
            onSelectError={onSelectProblem}
            nodeCount={current.diagram.nodes.length}
            linkCount={current.diagram.links.length}
          />
        </>
      )}
      {current && (
        <div
          style={{
            flex: '0 0 auto',
            height: yamlPanelOpen ? yamlPanelHeight : YAML_PANEL_COLLAPSED_HEIGHT,
            borderTop: '1px solid var(--dc-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {yamlPanelOpen && (
            <div
              data-testid="yaml-panel-resize-handle"
              onMouseDown={onResizeHandleMouseDown}
              style={{ height: 4, cursor: 'row-resize', background: 'var(--dc-border)', flex: '0 0 auto' }}
            />
          )}
          <button
            type="button"
            data-testid="yaml-panel-toggle"
            onClick={onToggleYamlPanel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--dc-space-2)',
              background: 'var(--dc-surface)',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--dc-space-1) var(--dc-space-3)',
              fontSize: 'var(--dc-font-size-base)',
              fontWeight: 600,
              color: 'var(--dc-text)',
              flex: '0 0 auto',
            }}
          >
            {yamlPanelOpen ? '▾' : '▸'} YAML
          </button>
          {yamlPanelOpen && (
            <div style={{ flex: 1, minHeight: 0, padding: '0 var(--dc-space-3) var(--dc-space-2)' }}>
              <YamlPanel
                text={current.rawText}
                onCommit={onCommitYamlText}
                focusLine={focusRequest?.kind === 'line' ? focusRequest.line : null}
                focusNonce={focusRequest?.nonce}
              />
            </div>
          )}
        </div>
      )}
      {current && (
        <textarea
          data-testid="yaml-source"
          readOnly
          value={current.rawText}
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
        />
      )}
      {!current && !loadError && (
        <div style={{ padding: 16 }}>
          <StartScreen onOpenExample={onOpenExample} onNewDiagram={onNewDiagram} />
        </div>
      )}
    </main>
  );
}
