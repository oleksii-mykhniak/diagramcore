import { useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { EditorWorkspace } from './components/EditorWorkspace';
import { Tour } from './components/Tour';
import { ExportDialog } from './components/ExportDialog';
import { useTheme } from './hooks/useTheme';
import { useDiagramStack } from './hooks/useDiagramStack';
import { useHistory } from './hooks/useHistory';
import { useDiagramEditing } from './hooks/useDiagramEditing';
import { useDiagramExports } from './hooks/useDiagramExports';
import { useViewSettings } from './hooks/useViewSettings';
import { useExportSettings } from './hooks/useExportSettings';

export default function App() {
  const [theme, , toggleTheme] = useTheme();
  const [showTour, setShowTour] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const view = useViewSettings();
  const exportSettings = useExportSettings();

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

  const { shareUrl, shareError, onExportLayout, onExportImage, onExportFlowStepsZip, onExportContext, onShare } =
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
        onExportImage={() => setShowExportDialog(true)}
        onExportFlowStepsZip={() => void onExportFlowStepsZip(exportSettings.settings)}
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
        grid={view.grid}
        onToggleGrid={view.toggleGrid}
        snap={view.snap}
        onToggleSnap={view.toggleSnap}
        yamlPanelOpen={view.yamlPanelOpen}
        onToggleYamlPanel={view.toggleYamlPanel}
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
        grid={view.grid}
        snap={view.snap}
        yamlPanelOpen={view.yamlPanelOpen}
        onToggleYamlPanel={view.toggleYamlPanel}
        yamlPanelHeight={view.yamlPanelHeight}
        onYamlPanelHeightChange={view.setYamlPanelHeight}
      />
      {showTour && <Tour onClose={() => setShowTour(false)} />}
      {showExportDialog && (
        <ExportDialog
          settings={exportSettings.settings}
          onChange={exportSettings.update}
          onCancel={() => setShowExportDialog(false)}
          onExport={() => {
            void onExportImage(exportSettings.settings);
            setShowExportDialog(false);
          }}
        />
      )}
    </div>
  );
}
