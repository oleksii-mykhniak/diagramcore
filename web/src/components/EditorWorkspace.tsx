import { useEffect, useRef, useState } from 'react';
import { FlowCanvas } from './FlowCanvas';
import { FlowPlayer } from './FlowPlayer';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { LinkProperties } from './LinkProperties';
import { DiagramOverview } from './DiagramOverview';
import { FlowEditorPanel } from './FlowEditorPanel';
import type { BranchTarget } from './FlowEditorPanel';
import { YamlPanel } from './YamlPanel';
import { StartScreen } from './StartScreen';
import { StatusBar } from './StatusBar';
import { RightDock } from './RightDock';
import type { RightDockTab } from './RightDock';
import { TabStrip } from './TabStrip';
import type { ValidationError } from '../wasmValidate';
import type { DiagramNode, DiagramLink, DiagramNoteDef, Flow } from '../types';
import type { LayoutPosition } from '../layoutFile';
import { computeFlowHighlight } from '../flowPlayer';
import type { FlowPlayerState } from '../flowPlayer';
import type { DiagramLevel, HistoryStep } from '../hooks/useDiagramStack';
import type { StyleOverride } from '../shapes';
import { edgeLinkKey } from '../edgeStyle';
import type { EdgeStyleOverride } from '../edgeStyle';
import { HistoryPanel } from './HistoryPanel';

interface EditorWorkspaceProps {
  loadError: string | null;
  drillError: string | null;
  importNotice: string | null;
  current: DiagramLevel | null;
  openTabs: string[];
  activeTab: string | null;
  mainFileName: string | null;
  levels: Record<string, DiagramLevel>;
  tabErrors: Record<string, string>;
  onSwitchTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
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
  selectedNodeIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onGroupNodeDragStop: (updates: Array<{ id: string; pos: LayoutPosition }>) => void;
  onNodeDragStop: (id: string, pos: LayoutPosition) => void;
  onNodeResizeStop: (id: string, size: { width: number; height: number }, pos: LayoutPosition) => void;
  onUpdateNodeStyle: (patch: Partial<StyleOverride>) => void;
  onResetNodeStyle: () => void;
  onUpdateNodeTextStyle: (patch: Partial<StyleOverride['text']>) => void;
  onResetNodeTextStyle: () => void;
  onNodeDoubleClick: (node: DiagramNode) => void;
  onNodeClick: (node: DiagramNode) => void;
  onNodeLabelCommit: (id: string, label: string) => void;
  editNodeRequest: { id: string; nonce: number } | null;
  onDropNodeType: (type: string, pos: LayoutPosition) => void;
  onDropNoteType: (pos: LayoutPosition) => void;
  onNoteDrag: (id: string, pos: LayoutPosition) => void;
  onNoteDoubleClick: (note: DiagramNoteDef) => void;
  showDescriptions: boolean;
  onConnectNodes: (source: string, target: string) => void;
  hoveredLinkIndex: number | null;
  onEdgeHover: (index: number | null) => void;
  onEdgeClick: (index: number) => void;
  selectedLinkIndex: number | null;
  onSelectLinkIndex: (index: number | null) => void;
  onUpdateEdgeStyle: (patch: Partial<EdgeStyleOverride>) => void;
  onResetEdgeStyle: () => void;
  onUpdateEdgeTextStyle: (patch: Partial<EdgeStyleOverride['text']>) => void;
  onResetEdgeTextStyle: () => void;
  onEdgeLabelDragStop: (linkIndex: number, offset: LayoutPosition) => void;
  onEdgeLabelCommit: (linkIndex: number, label: string) => void;
  onToggleEdgeLabelHidden: (linkIndex: number) => void;
  onToggleEdgeHidden: (linkIndex: number) => void;
  onToggleNodeLabelHidden: () => void;
  showEdgeLabels: boolean;
  coreView: boolean;
  focusRequest: { kind: 'node'; id: string; nonce: number } | { kind: 'line'; line: number; nonce: number } | null;
  onUpdateSelectedNode: (patch: Partial<DiagramNode>) => void;
  onDeleteSelectedNode: () => void;
  onDuplicateSelectedNodes: () => void;
  onZOrderOp: (op: 'front' | 'forward' | 'backward' | 'back') => void;
  canGroupSelected: boolean;
  canUngroupSelected: boolean;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  canAlignSelected: boolean;
  canDistributeSelected: boolean;
  onAlignSelected: (edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistributeSelected: (axis: 'horizontal' | 'vertical') => void;
  historySteps: HistoryStep[];
  historyCursor: number;
  onJumpToHistoryStep: (index: number) => void;
  onSetNodeImage: (file: File) => void;
  onRemoveNodeImage: () => void;
  onUpdateLink: (index: number, patch: Partial<DiagramLink>) => void;
  onDeleteLink: (index: number) => void;
  onCommitYamlText: (text: string) => void;
  onOpenExample: (fileName: string, text: string) => void;
  onNewDiagram: (text: string) => void;
  grid: boolean;
  snap: boolean;
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
  importNotice,
  current,
  openTabs,
  activeTab,
  mainFileName,
  levels,
  tabErrors,
  onSwitchTab,
  onCloseTab,
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
  selectedNodeIds,
  onSelectionChange,
  onGroupNodeDragStop,
  onNodeDragStop,
  onNodeResizeStop,
  onUpdateNodeStyle,
  onResetNodeStyle,
  onUpdateNodeTextStyle,
  onResetNodeTextStyle,
  onNodeDoubleClick,
  onNodeClick,
  onNodeLabelCommit,
  editNodeRequest,
  onDropNodeType,
  onDropNoteType,
  onNoteDrag,
  onNoteDoubleClick,
  showDescriptions,
  onConnectNodes,
  hoveredLinkIndex,
  onEdgeHover,
  onEdgeClick,
  selectedLinkIndex,
  onSelectLinkIndex,
  onUpdateEdgeStyle,
  onResetEdgeStyle,
  onUpdateEdgeTextStyle,
  onResetEdgeTextStyle,
  onEdgeLabelDragStop,
  onEdgeLabelCommit,
  onToggleEdgeLabelHidden,
  onToggleEdgeHidden,
  onToggleNodeLabelHidden,
  showEdgeLabels,
  coreView,
  focusRequest,
  onUpdateSelectedNode,
  onDeleteSelectedNode,
  onDuplicateSelectedNodes,
  onZOrderOp,
  canGroupSelected,
  canUngroupSelected,
  onGroupSelected,
  onUngroupSelected,
  canAlignSelected,
  canDistributeSelected,
  onAlignSelected,
  onDistributeSelected,
  historySteps,
  historyCursor,
  onJumpToHistoryStep,
  onSetNodeImage,
  onRemoveNodeImage,
  onUpdateLink,
  onDeleteLink,
  onCommitYamlText,
  onOpenExample,
  onNewDiagram,
  grid,
  snap,
}: EditorWorkspaceProps) {
  const highlight = current ? computeFlowHighlight(current.diagram, current.flowPlayerState) : null;
  const selectedNode = current?.diagram.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedLink = current && selectedLinkIndex !== null ? (current.diagram.links[selectedLinkIndex] ?? null) : null;
  /** Diagram overview's node list (PLAN4.md step 12.6) selects a node
   * exactly like clicking it on the canvas would. */
  const onSelectOverviewNode = (id: string) => {
    const node = current?.diagram.nodes.find((n) => n.id === id);
    if (node) onNodeClick(node);
  };

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

  /** Which dock tab was active on each tab, so drilling into a
   * sub-diagram (which selects its node and flips the dock to
   * Properties, per the effect above) doesn't leave the PARENT tab
   * stuck on Properties too once the user navigates back via
   * breadcrumb — e.g. a Flows tab open before drill-down should still
   * be there after returning (drill-down.spec.ts). */
  const dockTabByTabRef = useRef<Record<string, RightDockTab>>({});
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    const prev = prevTabRef.current;
    if (activeTab === prev) return;
    if (prev) dockTabByTabRef.current[prev] = rightDockTab;
    if (activeTab) setRightDockTab(dockTabByTabRef.current[activeTab] ?? 'properties');
    prevTabRef.current = activeTab;
    // Only fires on an actual tab switch — `rightDockTab` is read via the
    // ref-captured closure at that moment, not a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /** Clicking an edge on the canvas (outside flow recording) opens its
   * properties in the Properties tab (PLAN3.md step 11.9; folded from
   * its own Links tab in PLAN4.md step 12.6) — mirrors the
   * `selectedNodeId` effect above. */
  useEffect(() => {
    if (selectedLinkIndex === null) return;
    setRightDockTab('properties');
    setRightDockCollapsed(false);
  }, [selectedLinkIndex]);

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
      {openTabs.length > 0 && (
        <TabStrip
          openTabs={openTabs}
          activeTab={activeTab}
          mainFileName={mainFileName}
          levels={levels}
          tabErrors={tabErrors}
          onSwitchTab={onSwitchTab}
          onCloseTab={onCloseTab}
        />
      )}
      {activeTab && tabErrors[activeTab] && (
        <p role="alert" data-testid="tab-error">
          {tabErrors[activeTab]}
        </p>
      )}
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
                sizes={current.sizes}
                onNodeResizeStop={onNodeResizeStop}
                styles={current.styles}
                imageAssets={current.imageAssets}
                onNodeDoubleClick={onNodeDoubleClick}
                onNodeClick={onNodeClick}
                onNodeLabelCommit={onNodeLabelCommit}
                editNodeRequestId={editNodeRequest?.id ?? null}
                editNodeRequestNonce={editNodeRequest?.nonce}
                selectedNodeIds={selectedNodeIds}
                onSelectionChange={onSelectionChange}
                onGroupDragStop={onGroupNodeDragStop}
                onDropNodeType={onDropNodeType}
                onConnectNodes={onConnectNodes}
                hoveredLinkIndex={hoveredLinkIndex}
                onEdgeHover={onEdgeHover}
                onEdgeClick={onEdgeClick}
                edgeStyles={current.edgeStyles}
                edgeLabelOffsets={current.edgeLabelOffsets}
                hiddenEdgeLabels={current.hiddenEdgeLabels}
                hiddenEdges={current.hiddenEdges}
                hiddenNodeLabels={current.hiddenNodeLabels}
                showEdgeLabels={showEdgeLabels}
                coreView={coreView}
                zOrder={current.zOrder}
                onZOrderOp={onZOrderOp}
                canGroupSelected={canGroupSelected}
                canUngroupSelected={canUngroupSelected}
                onGroupSelected={onGroupSelected}
                onUngroupSelected={onUngroupSelected}
                canAlignSelected={canAlignSelected}
                canDistributeSelected={canDistributeSelected}
                onAlignSelected={onAlignSelected}
                onDistributeSelected={onDistributeSelected}
                onDeleteSelectedNode={onDeleteSelectedNode}
                onDuplicateSelectedNodes={onDuplicateSelectedNodes}
                onEdgeLabelDragStop={onEdgeLabelDragStop}
                onEdgeLabelCommit={onEdgeLabelCommit}
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
                  <PropertiesPanel
                    node={selectedNode}
                    diagram={current.diagram}
                    onUpdate={onUpdateSelectedNode}
                    onDelete={onDeleteSelectedNode}
                    style={current.styles[selectedNode.id]}
                    onUpdateStyle={onUpdateNodeStyle}
                    onResetStyle={onResetNodeStyle}
                    onUpdateTextStyle={onUpdateNodeTextStyle}
                    onResetTextStyle={onResetNodeTextStyle}
                    labelHidden={current.hiddenNodeLabels.has(selectedNode.id)}
                    onToggleLabelHidden={onToggleNodeLabelHidden}
                    imageSrc={
                      current.styles[selectedNode.id]?.image
                        ? current.imageAssets[current.styles[selectedNode.id]!.image!]
                        : undefined
                    }
                    onSetImage={onSetNodeImage}
                    onRemoveImage={onRemoveNodeImage}
                  />
                ) : selectedLink ? (
                  <LinkProperties
                    link={selectedLink}
                    onUpdate={(patch) => onUpdateLink(selectedLinkIndex!, patch)}
                    onDelete={() => onDeleteLink(selectedLinkIndex!)}
                    style={current.edgeStyles[edgeLinkKey(selectedLink)]}
                    onUpdateStyle={onUpdateEdgeStyle}
                    onResetStyle={onResetEdgeStyle}
                    onUpdateTextStyle={onUpdateEdgeTextStyle}
                    onResetTextStyle={onResetEdgeTextStyle}
                    labelHidden={current.hiddenEdgeLabels.has(edgeLinkKey(selectedLink))}
                    onToggleLabelHidden={() => onToggleEdgeLabelHidden(selectedLinkIndex!)}
                    connectionHidden={current.hiddenEdges.has(edgeLinkKey(selectedLink))}
                    onToggleConnectionHidden={() => onToggleEdgeHidden(selectedLinkIndex!)}
                  />
                ) : (
                  <DiagramOverview
                    diagram={current.diagram}
                    hoveredLinkIndex={hoveredLinkIndex}
                    onHoverLink={onEdgeHover}
                    onSelectNode={onSelectOverviewNode}
                    onSelectLink={onSelectLinkIndex}
                    hiddenEdges={current.hiddenEdges}
                  />
                )
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
              historyContent={<HistoryPanel steps={historySteps} cursor={historyCursor} onJumpTo={onJumpToHistoryStep} />}
              yamlContent={
                <div style={{ height: '100%', padding: 'var(--dc-space-2) var(--dc-space-3)' }}>
                  <YamlPanel
                    text={current.rawText}
                    onCommit={onCommitYamlText}
                    focusLine={focusRequest?.kind === 'line' ? focusRequest.line : null}
                    focusNonce={focusRequest?.nonce}
                  />
                </div>
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
