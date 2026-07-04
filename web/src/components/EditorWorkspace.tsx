import { FlowCanvas } from './FlowCanvas';
import { FlowPlayer } from './FlowPlayer';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { LinksPanel } from './LinksPanel';
import { FlowEditorPanel } from './FlowEditorPanel';
import type { BranchTarget } from './FlowEditorPanel';
import { YamlPanel } from './YamlPanel';
import { ProblemsPanel } from './ProblemsPanel';
import { StartScreen } from './StartScreen';
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

/** The content of `<main>`: problems/flow-player/flow-recorder above the
 * canvas+panels, then the YAML panel, matching the pre-decomposition
 * DOM/testid structure exactly. */
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

  return (
    <main style={{ flex: 1, overflow: 'auto', padding: 16 }}>
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
      {current && <ProblemsPanel errors={current.errors} onSelectError={onSelectProblem} />}
      {current && <FlowPlayer diagram={current.diagram} state={current.flowPlayerState} onChange={onFlowPlayerChange} />}
      {current && (
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
      )}
      {current && <Palette />}
      {current && (
        <div style={{ display: 'flex' }}>
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
            {selectedNode && (
              <div style={{ position: 'absolute', top: 0, right: 0, background: '#fff' }}>
                <PropertiesPanel node={selectedNode} onUpdate={onUpdateSelectedNode} onDelete={onDeleteSelectedNode} />
              </div>
            )}
          </div>
          <LinksPanel
            links={current.diagram.links}
            hoveredLinkIndex={hoveredLinkIndex}
            onHoverLink={onEdgeHover}
            onUpdateLink={onUpdateLink}
            onDeleteLink={onDeleteLink}
          />
        </div>
      )}
      {current && (
        <div style={{ marginTop: 16, borderTop: '1px solid #ccc', paddingTop: 8 }}>
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
      {!current && !loadError && <StartScreen onOpenExample={onOpenExample} onNewDiagram={onNewDiagram} />}
    </main>
  );
}
