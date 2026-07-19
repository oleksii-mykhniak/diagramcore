import { useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { EditorWorkspace } from './components/EditorWorkspace';
import { Tour } from './components/Tour';
import { ExportDialog } from './components/ExportDialog';
import { useTheme } from './hooks/useTheme';
import { useDiagramStack } from './hooks/useDiagramStack';
import type { DiagramLevel } from './hooks/useDiagramStack';
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
    levels,
    openTabs,
    activeTab,
    mainFileName,
    tabErrors,
    breadcrumbFileNames,
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
    saveStatus,
    draftSavedAt,
    autoSaveToFile,
    toggleAutoSaveToFile,
    openDetails,
    switchTab,
    closeTab,
    setRenderStyle,
    restorePrompt,
    onRestoreAutosave,
    onDiscardAutosave,
  } = useDiagramStack();

  const { onUndo, onRedo } = useHistory(levelRef, runMutation, updateCurrentLevel, historyRef, syncHistoryCounts);

  const {
    selectedNodeId,
    selectedNodeIds,
    onSelectionChange,
    onGroupNodeDragStop,
    onDuplicateSelectedNodes,
    onZOrderOp,
    onSetNodeImage,
    onRemoveNodeImage,
    hoveredLinkIndex,
    setHoveredLinkIndex,
    selectedLinkIndex,
    setSelectedLinkIndex,
    recording,
    branchTarget,
    focusRequest,
    editNodeRequest,
    recordingFlow,
    applyTextReplace,
    onDropNodeType,
    onDropNoteType,
    onNoteDrag,
    onNoteDoubleClick,
    onNodeClick,
    onUpdateSelectedNode,
    onUpdateNodeLabel,
    onDeleteSelectedNode,
    onConnectNodes,
    onUpdateLink,
    onDeleteLink,
    onNodeDrag: onNodeDragStop,
    onNodeResizeStop,
    onUpdateNodeStyle,
    onResetNodeStyle,
    onUpdateNodeTextStyle,
    onResetNodeTextStyle,
    onUpdateEdgeStyle,
    onResetEdgeStyle,
    onUpdateEdgeTextStyle,
    onResetEdgeTextStyle,
    onEdgeLabelDragStop,
    onEdgeLabelCommit,
    onToggleEdgeLabelHidden,
    onToggleEdgeHidden,
    onToggleNodeLabelHidden,
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
    useDiagramExports(current, view.showEdgeLabels);

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
        saveStatus={saveStatus}
        draftSavedAt={draftSavedAt}
        autoSaveToFile={autoSaveToFile}
        onToggleAutoSaveToFile={toggleAutoSaveToFile}
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
        breadcrumbLevels={breadcrumbFileNames.map((f) => levels[f]).filter((l): l is DiagramLevel => Boolean(l))}
        onBreadcrumbClick={switchTab}
        selectedNodeId={selectedNodeId}
        selectedNodeIds={selectedNodeIds}
        onDeleteSelectedNode={onDeleteSelectedNode}
        onDuplicateSelectedNodes={onDuplicateSelectedNodes}
        onZOrderOp={onZOrderOp}
        onShowTour={() => setShowTour(true)}
        grid={view.grid}
        onToggleGrid={view.toggleGrid}
        snap={view.snap}
        onToggleSnap={view.toggleSnap}
        showDescriptions={view.showDescriptions}
        onToggleShowDescriptions={view.toggleShowDescriptions}
        showEdgeLabels={view.showEdgeLabels}
        onToggleShowEdgeLabels={view.toggleShowEdgeLabels}
        coreView={view.coreView}
        onToggleCoreView={view.toggleCoreView}
        renderStyle={current?.renderStyle ?? 'clean'}
        onToggleRenderStyle={() => setRenderStyle(current?.renderStyle === 'sketch' ? 'clean' : 'sketch')}
        onImportDrawio={(file) => void onImportDrawio(file)}
      />
      {restorePrompt && (
        <div
          data-testid="restore-autosave-banner"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--dc-space-3)',
            padding: 'var(--dc-space-2) var(--dc-space-3)',
            background: 'var(--dc-surface)',
            borderBottom: '1px solid var(--dc-border)',
            color: 'var(--dc-text)',
            fontSize: 'var(--dc-font-size-base)',
          }}
        >
          <span>Restore unsaved work from a previous session?</span>
          <button type="button" data-testid="restore-autosave-restore" onClick={() => void onRestoreAutosave()}>
            Restore
          </button>
          <button type="button" data-testid="restore-autosave-discard" onClick={onDiscardAutosave}>
            Discard
          </button>
        </div>
      )}
      <EditorWorkspace
        loadError={loadError}
        drillError={drillError}
        importNotice={importNotice}
        current={current}
        openTabs={openTabs}
        activeTab={activeTab}
        mainFileName={mainFileName}
        levels={levels}
        tabErrors={tabErrors}
        onSwitchTab={switchTab}
        onCloseTab={closeTab}
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
        selectedNodeIds={selectedNodeIds}
        onSelectionChange={onSelectionChange}
        onGroupNodeDragStop={onGroupNodeDragStop}
        onNodeDragStop={onNodeDragStop}
        onNodeResizeStop={onNodeResizeStop}
        onUpdateNodeStyle={onUpdateNodeStyle}
        onResetNodeStyle={onResetNodeStyle}
        onUpdateNodeTextStyle={onUpdateNodeTextStyle}
        onResetNodeTextStyle={onResetNodeTextStyle}
        onNodeDoubleClick={(node) => void openDetails(node)}
        onNodeClick={onNodeClick}
        onNodeLabelCommit={onUpdateNodeLabel}
        editNodeRequest={editNodeRequest}
        onDropNodeType={onDropNodeType}
        onDropNoteType={onDropNoteType}
        onNoteDrag={onNoteDrag}
        onNoteDoubleClick={onNoteDoubleClick}
        showDescriptions={view.showDescriptions}
        onConnectNodes={onConnectNodes}
        hoveredLinkIndex={hoveredLinkIndex}
        onEdgeHover={setHoveredLinkIndex}
        onEdgeClick={onEdgeClickRecord}
        selectedLinkIndex={selectedLinkIndex}
        onSelectLinkIndex={setSelectedLinkIndex}
        onUpdateEdgeStyle={onUpdateEdgeStyle}
        onResetEdgeStyle={onResetEdgeStyle}
        onUpdateEdgeTextStyle={onUpdateEdgeTextStyle}
        onResetEdgeTextStyle={onResetEdgeTextStyle}
        onEdgeLabelDragStop={onEdgeLabelDragStop}
        onEdgeLabelCommit={onEdgeLabelCommit}
        onToggleEdgeLabelHidden={onToggleEdgeLabelHidden}
        onToggleEdgeHidden={onToggleEdgeHidden}
        onToggleNodeLabelHidden={onToggleNodeLabelHidden}
        showEdgeLabels={view.showEdgeLabels}
        coreView={view.coreView}
        focusRequest={focusRequest}
        onUpdateSelectedNode={onUpdateSelectedNode}
        onDeleteSelectedNode={onDeleteSelectedNode}
        onDuplicateSelectedNodes={onDuplicateSelectedNodes}
        onZOrderOp={onZOrderOp}
        onSetNodeImage={onSetNodeImage}
        onRemoveNodeImage={onRemoveNodeImage}
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
