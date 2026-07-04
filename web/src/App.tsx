import { useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { EditorWorkspace } from './components/EditorWorkspace';
import { Tour } from './components/Tour';
import { useTheme } from './hooks/useTheme';
import { useDiagramStack } from './hooks/useDiagramStack';
import { useHistory } from './hooks/useHistory';
import { useDiagramEditing } from './hooks/useDiagramEditing';
import { useDiagramExports } from './hooks/useDiagramExports';

export default function App() {
  const [theme, , toggleTheme] = useTheme();
  const [showTour, setShowTour] = useState(false);

  const {
    stack,
    current,
    loadError,
    setLoadError,
    drillError,
    levelRef,
    runMutation,
    historyRef,
    historyCounts,
    syncHistoryCounts,
    pushHistory,
    openTextAsDiagram,
    onFileInput,
    onDrop,
    onDragOver,
    updateCurrentLevel,
    onOpenNative,
    onSave,
    hasUnsavedChanges,
    openDetails,
    goToLevel,
  } = useDiagramStack();

  const { onUndo, onRedo } = useHistory(levelRef, runMutation, updateCurrentLevel, historyRef, syncHistoryCounts);

  const {
    selectedNodeId,
    hoveredLinkIndex,
    setHoveredLinkIndex,
    recording,
    branchTarget,
    focusRequest,
    recordingFlow,
    applyTextReplace,
    onDropNodeType,
    onNodeClick,
    onUpdateSelectedNode,
    onDeleteSelectedNode,
    onConnectNodes,
    onUpdateLink,
    onDeleteLink,
    onNodeDrag,
    onNewFlow,
    onToggleRecording,
    onAddBranch,
    onSwitchArm,
    onFinishBranch,
    onEdgeClickRecord,
    onUpdateFlowStepNote,
    onDeleteFlowStep,
    onSelectProblem,
    onRelayout,
    onRelayoutAll,
    onImportLayout,
    onFlowPlayerChange,
  } = useDiagramEditing(current, levelRef, runMutation, updateCurrentLevel, pushHistory, setLoadError);

  const { shareUrl, shareError, onExportLayout, onExportPng, onExportFlowStepsZip, onExportContext, onShare } =
    useDiagramExports(current);

  return (
    <div onDrop={onDrop} onDragOver={onDragOver} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        theme={theme}
        toggleTheme={toggleTheme}
        onFileInput={onFileInput}
        onOpenNative={(fallback) => void onOpenNative(fallback)}
        onNewDiagram={(text) => void openTextAsDiagram('untitled.dc.yaml', text)}
        current={current}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={() => void onSave()}
        onExportLayout={onExportLayout}
        onImportLayout={onImportLayout}
        onExportPng={() => void onExportPng()}
        onExportFlowStepsZip={() => void onExportFlowStepsZip()}
        onExportContext={() => void onExportContext()}
        onShare={onShare}
        shareUrl={shareUrl}
        shareError={shareError}
        onRelayout={() => void onRelayout()}
        onRelayoutAll={() => void onRelayoutAll()}
        onUndo={() => void onUndo()}
        onRedo={() => void onRedo()}
        historyCounts={historyCounts}
        stack={stack}
        goToLevel={goToLevel}
        selectedNodeId={selectedNodeId}
        onDeleteSelectedNode={onDeleteSelectedNode}
        onShowTour={() => setShowTour(true)}
      />
      <EditorWorkspace
        loadError={loadError}
        drillError={drillError}
        current={current}
        onSelectProblem={onSelectProblem}
        onFlowPlayerChange={onFlowPlayerChange}
        recordingFlow={recordingFlow}
        recording={recording}
        branchTarget={branchTarget}
        onNewFlow={onNewFlow}
        onToggleRecording={onToggleRecording}
        onAddBranch={onAddBranch}
        onSwitchArm={onSwitchArm}
        onFinishBranch={onFinishBranch}
        onUpdateFlowStepNote={onUpdateFlowStepNote}
        onDeleteStep={onDeleteFlowStep}
        selectedNodeId={selectedNodeId}
        onNodeDrag={onNodeDrag}
        onNodeDoubleClick={(node) => void openDetails(node)}
        onNodeClick={onNodeClick}
        onDropNodeType={onDropNodeType}
        onConnectNodes={onConnectNodes}
        hoveredLinkIndex={hoveredLinkIndex}
        onEdgeHover={setHoveredLinkIndex}
        onEdgeClick={onEdgeClickRecord}
        focusRequest={focusRequest}
        onUpdateSelectedNode={onUpdateSelectedNode}
        onDeleteSelectedNode={onDeleteSelectedNode}
        onUpdateLink={onUpdateLink}
        onDeleteLink={onDeleteLink}
        onCommitYamlText={(text) => void applyTextReplace(text)}
        onOpenExample={(fileName, text) => void openTextAsDiagram(fileName, text)}
        onNewDiagram={(text) => void openTextAsDiagram('untitled.dc.yaml', text)}
      />
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
