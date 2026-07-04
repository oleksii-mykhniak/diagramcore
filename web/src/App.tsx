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
import { importDrawio } from './drawioImport';
import { validateDiagram } from './wasmValidate';

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
    setRenderStyle,
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
    onDropNoteType,
    onNoteDrag,
    onNoteDoubleClick,
    onNodeClick,
    onUpdateSelectedNode,
    onDeleteSelectedNode,
    onConnectNodes,
    onUpdateLink,
    onDeleteLink,
    onNodeDrag: onNodeDragStop,
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

  const [importNotice, setImportNotice] = useState<string | null>(null);

  /** File → "Import draw.io…" (PLAN.md step 10.10): parses the file, then
   * always WASM-validates the generated YAML before opening it — a
   * broken import surfaces as an error message, never a silently-open
   * document with hidden problems. */
  const onImportDrawio = async (file: File) => {
    setImportNotice(null);
    let result;
    try {
      result = await importDrawio(file);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return;
    }
    const errors = await validateDiagram(result.yamlText);
    if (errors.length > 0) {
      setLoadError(
        `Import produced ${errors.length} validation error${errors.length === 1 ? '' : 's'}: ` +
          errors.map((e) => `[${e.code}] ${e.message}`).join('; '),
      );
      return;
    }
    await openTextAsDiagram(result.fileName, result.yamlText, result.positions);
    setImportNotice(result.summary);
  };

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
        showDescriptions={view.showDescriptions}
        onToggleShowDescriptions={view.toggleShowDescriptions}
        renderStyle={current?.renderStyle ?? 'clean'}
        onToggleRenderStyle={() => setRenderStyle(current?.renderStyle === 'sketch' ? 'clean' : 'sketch')}
        onImportDrawio={(file) => void onImportDrawio(file)}
      />
      <EditorWorkspace
        loadError={loadError}
        drillError={drillError}
        importNotice={importNotice}
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
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={(node) => void openDetails(node)}
        onNodeClick={onNodeClick}
        onDropNodeType={onDropNodeType}
        onDropNoteType={onDropNoteType}
        onNoteDrag={onNoteDrag}
        onNoteDoubleClick={onNoteDoubleClick}
        showDescriptions={view.showDescriptions}
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
      />
      {showTour && <Tour onClose={() => setShowTour(false)} />}
      {showExportDialog && (
        <ExportDialog
          settings={exportSettings.settings}
          onChange={exportSettings.update}
          renderStyle={current?.renderStyle ?? 'clean'}
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
