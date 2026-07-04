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
import type { DiagramNode, DiagramLink, Flow } from '../types';
import type { LayoutPosition } from '../layoutFile';
import { computeFlowHighlight } from '../flowPlayer';
import type { FlowPlayerState } from '../flowPlayer';
import type { DiagramLevel } from '../hooks/useDiagramStack';

interface EditorWorkspaceProps {
  loadError: string | null;
  drillError: string | null;
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
  onNodeDrag: (id: string, pos: LayoutPosition) => void;
  onNodeDoubleClick: (node: DiagramNode) => void;
  onNodeClick: (node: DiagramNode) => void;
  onDropNodeType: (type: string, pos: LayoutPosition) => void;
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
}

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
  onNodeDrag,
  onNodeDoubleClick,
  onNodeClick,
  onDropNodeType,
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

  return (
    <main style={{ flex: 1, overflow: 'auto' }}>
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
      {current && (
        <>
          <div style={{ display: 'flex' }}>
            <Palette />
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <FlowCanvas
                diagram={current.diagram}
                layout={current.layout}
                positions={current.positions}
                onNodeDrag={onNodeDrag}
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
              />
            </div>
            <RightDock
              tab={rightDockTab}
              onTabChange={setRightDockTab}
              collapsed={rightDockCollapsed}
              onToggleCollapsed={() => setRightDockCollapsed((c) => !c)}
              propertiesContent={
                selectedNode ? (
                  <PropertiesPanel node={selectedNode} onUpdate={onUpdateSelectedNode} onDelete={onDeleteSelectedNode} />
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
        <div style={{ borderTop: '1px solid #ccc', padding: '8px 16px' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>YAML</h3>
          <YamlPanel
            text={current.rawText}
            onCommit={onCommitYamlText}
            focusLine={focusRequest?.kind === 'line' ? focusRequest.line : null}
            focusNonce={focusRequest?.nonce}
          />
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
