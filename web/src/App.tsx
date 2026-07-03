import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { parseDiagram } from './parseDiagram';
import { generateContext, validateDiagram } from './wasmValidate';
import type { ValidationError } from './wasmValidate';
import { computeLayout } from './layout';
import type { DiagramLayout } from './layout';
import type { Diagram, DiagramNode } from './types';
import { FlowCanvas } from './components/FlowCanvas';
import { FlowPlayer } from './components/FlowPlayer';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LinksPanel } from './components/LinksPanel';
import type { DiagramLink } from './types';
import { buildLayoutFile, downloadLayoutFile, layoutFileName, parseLayoutFile } from './layoutFile';
import type { LayoutPosition } from './layoutFile';
import { computeFlowHighlight, flowStepFrames, initialFlowPlayerState, resolveFlowSteps } from './flowPlayer';
import type { FlowPlayerState } from './flowPlayer';
import { downloadBlob, renderDiagramSVGString, svgStringToPngBlob } from './svgExport';
import { zipSync } from 'fflate';
import { applyPatch } from './yamlPatch';
import type { PatchOp } from './yamlPatch';
import { findNodeDependents } from './dependents';

interface DiagramLevel {
  fileName: string;
  rawText: string;
  diagram: Diagram;
  layout: DiagramLayout;
  positions: Record<string, LayoutPosition>;
  errors: ValidationError[];
  flowPlayerState: FlowPlayerState;
  /** Node ids whose position was set manually (drag or layout import),
   * as opposed to the last auto-layout computation — "Re-layout"
   * (PLAN.md step 6.2) leaves these untouched. */
  manualPositionIds: Set<string>;
}

/** <file.dc.yaml> -> <file>, for naming exported PNG/zip/markdown files. */
function baseName(fileName: string): string {
  return fileName.replace(/\.dc\.yaml$/, '').replace(/\.ya?ml$/, '');
}

/** <details reference> -> basename, matching how details are resolved
 * against the virtual filesystem of files opened together (see openFiles
 * below). Real relative-path resolution (../, subdirectories) is out of
 * scope for v0 - all files are expected in the same flat selection. */
function detailsBasename(details: string): string {
  const parts = details.split('/');
  return parts[parts.length - 1];
}

export default function App() {
  const [virtualFS, setVirtualFS] = useState<Record<string, string>>({});
  const [stack, setStack] = useState<DiagramLevel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);

  const current = stack.length > 0 ? stack[stack.length - 1] : null;

  const buildLevel = useCallback(async (fileName: string, text: string): Promise<DiagramLevel> => {
    const parsed = parseDiagram(text);
    const validationErrors = await validateDiagram(text);
    const computedLayout = await computeLayout(parsed);
    return {
      fileName,
      rawText: text,
      diagram: parsed,
      layout: computedLayout,
      positions: Object.fromEntries(computedLayout.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
      errors: validationErrors,
      flowPlayerState: initialFlowPlayerState,
      manualPositionIds: new Set<string>(),
    };
  }, []);

  const openFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoadError(null);
      setDrillError(null);
      try {
        const contents = await Promise.all(files.map(async (f) => [f.name, await f.text()] as const));
        setVirtualFS(Object.fromEntries(contents));
        const [primaryName, primaryText] = contents[0];
        const level = await buildLevel(primaryName, primaryText);
        setStack([level]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        setStack([]);
      }
    },
    [buildLevel],
  );

  const onFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      void openFiles(Array.from(e.target.files ?? []));
    },
    [openFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      void openFiles(Array.from(e.dataTransfer.files ?? []));
    },
    [openFiles],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const updateCurrentLevel = useCallback((patch: Partial<DiagramLevel>) => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }, []);

  /** Applies structured YAML patches (PLAN.md step 7.1) to the current
   * level: re-parses/re-validates the patched text and re-derives layout,
   * keeping manual positions and giving newly-added or newly-auto-laid-out
   * nodes fresh auto-layout coordinates (mirrors the merge in
   * `onRelayout`). `manualPosition` additionally marks/positions a single
   * node as manual — used when a node is created by dropping it at a
   * specific canvas location. */
  const applyOps = useCallback(
    async (ops: PatchOp[], opts?: { manualPosition?: { id: string; pos: LayoutPosition } }) => {
      if (!current) return;
      const newText = applyPatch(current.rawText, ops);
      const newDiagram = parseDiagram(newText);
      const newErrors = await validateDiagram(newText);
      const recomputed = await computeLayout(newDiagram);
      const manualPositionIds = new Set(current.manualPositionIds);
      const positions: Record<string, LayoutPosition> = {};
      for (const n of recomputed.nodes) {
        positions[n.id] =
          manualPositionIds.has(n.id) && current.positions[n.id] ? current.positions[n.id] : { x: n.x, y: n.y };
      }
      if (opts?.manualPosition) {
        positions[opts.manualPosition.id] = opts.manualPosition.pos;
        manualPositionIds.add(opts.manualPosition.id);
      }
      updateCurrentLevel({
        rawText: newText,
        diagram: newDiagram,
        errors: newErrors,
        layout: recomputed,
        positions,
        manualPositionIds,
      });
    },
    [current, updateCurrentLevel],
  );

  const onDropNodeType = useCallback(
    (type: string, pos: LayoutPosition) => {
      if (!current) return;
      const existingIds = new Set(current.diagram.nodes.map((n) => n.id));
      let n = 1;
      let id = `${type}${n}`;
      while (existingIds.has(id)) {
        n += 1;
        id = `${type}${n}`;
      }
      void applyOps([{ op: 'addNode', node: { id, type } }], { manualPosition: { id, pos } });
      setSelectedNodeId(id);
    },
    [current, applyOps],
  );

  const onNodeClick = useCallback((node: DiagramNode) => {
    setSelectedNodeId(node.id);
  }, []);

  const onUpdateSelectedNode = useCallback(
    (patch: Partial<DiagramNode>) => {
      if (!selectedNodeId) return;
      void applyOps([{ op: 'updateNode', id: selectedNodeId, patch }]);
    },
    [selectedNodeId, applyOps],
  );

  const onDeleteSelectedNode = useCallback(() => {
    if (!current || !selectedNodeId) return;
    const deps = findNodeDependents(current.diagram, selectedNodeId);
    if (deps.links.length > 0 || deps.flowSteps.length > 0) {
      const lines = [
        ...deps.links.map((l) => `link ${l.from} -> ${l.to}`),
        ...deps.flowSteps.map((s) => `step in flow "${s.flowName}"`),
      ];
      const proceed = window.confirm(
        `Deleting node "${selectedNodeId}" also removes:\n${lines.join('\n')}\n\nContinue?`,
      );
      if (!proceed) return;
    }
    const ops: PatchOp[] = [];
    const indicesByFlow = new Map<string, number[]>();
    for (const s of deps.flowSteps) {
      const arr = indicesByFlow.get(s.flowName) ?? [];
      arr.push(s.index);
      indicesByFlow.set(s.flowName, arr);
    }
    for (const [flowName, indices] of indicesByFlow) {
      for (const atIndex of [...indices].sort((a, b) => b - a)) {
        ops.push({ op: 'removeFlowStep', flowName, atIndex });
      }
    }
    for (const l of deps.links) ops.push({ op: 'removeLink', from: l.from, to: l.to });
    ops.push({ op: 'removeNode', id: selectedNodeId });
    void applyOps(ops);
    setSelectedNodeId(null);
  }, [current, selectedNodeId, applyOps]);

  const onConnectNodes = useCallback(
    (source: string, target: string) => {
      void applyOps([{ op: 'addLink', link: { from: source, to: target, type: 'request' } }]);
    },
    [applyOps],
  );

  const onUpdateLink = useCallback(
    (index: number, patch: Partial<DiagramLink>) => {
      void applyOps([{ op: 'updateLink', index, patch }]);
    },
    [applyOps],
  );

  const onDeleteLink = useCallback(
    (index: number) => {
      if (!current) return;
      const link = current.diagram.links[index];
      if (!link) return;
      void applyOps([{ op: 'removeLink', from: link.from, to: link.to, type: link.type }]);
    },
    [current, applyOps],
  );

  const onNodeDrag = useCallback(
    (id: string, pos: LayoutPosition) => {
      if (!current) return;
      updateCurrentLevel({
        positions: { ...current.positions, [id]: pos },
        manualPositionIds: new Set(current.manualPositionIds).add(id),
      });
    },
    [current, updateCurrentLevel],
  );

  const onRelayout = useCallback(async () => {
    if (!current) return;
    const recomputed = await computeLayout(current.diagram);
    const positions = { ...current.positions };
    for (const n of recomputed.nodes) {
      if (!current.manualPositionIds.has(n.id)) {
        positions[n.id] = { x: n.x, y: n.y };
      }
    }
    updateCurrentLevel({ layout: recomputed, positions });
  }, [current, updateCurrentLevel]);

  const onExportLayout = useCallback(() => {
    if (!current) return;
    downloadLayoutFile(layoutFileName(current.fileName), buildLayoutFile(current.positions));
  }, [current]);

  const onImportLayout = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !current) return;
      void file.text().then((text) => {
        try {
          const imported = parseLayoutFile(text);
          const importedPositions = imported.views.default?.positions ?? {};
          const manualPositionIds = new Set(current.manualPositionIds);
          for (const id of Object.keys(importedPositions)) manualPositionIds.add(id);
          updateCurrentLevel({
            positions: { ...current.positions, ...importedPositions },
            manualPositionIds,
          });
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    },
    [current, updateCurrentLevel],
  );

  const onFlowPlayerChange = useCallback(
    (flowPlayerState: FlowPlayerState) => updateCurrentLevel({ flowPlayerState }),
    [updateCurrentLevel],
  );

  const onExportPng = useCallback(async () => {
    if (!current) return;
    const highlight = computeFlowHighlight(current.diagram, current.flowPlayerState);
    const svg = renderDiagramSVGString(current.diagram, current.layout, current.positions, {
      activeStep: highlight.activeStep ?? undefined,
      visitedStepKeys: highlight.visitedStepKeys,
    });
    const blob = await svgStringToPngBlob(svg, current.layout.width, current.layout.height);
    downloadBlob(`${baseName(current.fileName)}.png`, blob);
  }, [current]);

  const onExportFlowStepsZip = useCallback(async () => {
    if (!current || current.flowPlayerState.flowIndex === null) return;
    const flow = current.diagram.flows?.[current.flowPlayerState.flowIndex];
    if (!flow) return;
    const { steps } = resolveFlowSteps(flow, current.flowPlayerState.choices);
    const frames = flowStepFrames(steps);
    const zipInput: Record<string, Uint8Array> = {};
    for (const frame of frames) {
      const svg = renderDiagramSVGString(current.diagram, current.layout, current.positions, {
        activeStep: frame.activeStep,
        visitedStepKeys: frame.visitedStepKeys,
      });
      const blob = await svgStringToPngBlob(svg, current.layout.width, current.layout.height);
      zipInput[`${frame.name}.png`] = new Uint8Array(await blob.arrayBuffer());
    }
    const zipped = zipSync(zipInput);
    downloadBlob(`${baseName(current.fileName)}-${flow.name}-steps.zip`, new Blob([zipped as BlobPart]));
  }, [current]);

  const onExportContext = useCallback(async () => {
    if (!current) return;
    const md = await generateContext(current.rawText);
    downloadBlob(`${baseName(current.fileName)}.md`, new Blob([md], { type: 'text/markdown' }));
  }, [current]);

  const openDetails = useCallback(
    async (node: DiagramNode) => {
      setDrillError(null);
      if (!node.details) return;
      const basename = detailsBasename(node.details);
      const text = virtualFS[basename];
      if (text === undefined) {
        setDrillError(
          `Cannot open sub-diagram "${node.details}": that file wasn't opened together with this one. ` +
            'Select both files (or a whole folder) in the file picker to enable drill-down.',
        );
        return;
      }
      try {
        const level = await buildLevel(basename, text);
        setStack((prev) => [...prev, level]);
      } catch (err) {
        setDrillError(err instanceof Error ? err.message : String(err));
      }
    },
    [virtualFS, buildLevel],
  );

  const goToLevel = useCallback((index: number) => {
    setDrillError(null);
    setStack((prev) => prev.slice(0, index + 1));
  }, []);

  const highlight = current ? computeFlowHighlight(current.diagram, current.flowPlayerState) : null;
  const selectedNode = current?.diagram.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #ccc' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>DiagramCore</h1>
        <input
          type="file"
          accept=".yaml,.yml"
          multiple
          data-testid="file-input"
          onChange={onFileInput}
        />
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
            <button type="button" data-testid="export-png" onClick={() => void onExportPng()}>
              Export PNG
            </button>{' '}
            <button
              type="button"
              data-testid="export-flow-steps-zip"
              onClick={() => void onExportFlowStepsZip()}
              disabled={current.flowPlayerState.flowIndex === null}
            >
              Export flow steps (zip)
            </button>{' '}
            <button type="button" data-testid="export-context" onClick={() => void onExportContext()}>
              Export AI context (markdown)
            </button>{' '}
            <button type="button" data-testid="relayout" onClick={() => void onRelayout()}>
              Re-layout
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
                    style={{ background: 'none', border: 'none', color: '#06c', cursor: 'pointer', padding: 0 }}
                  >
                    {level.diagram.diagram.title}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}
      </header>
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
        {current && current.errors.length > 0 && (
          <ul data-testid="validation-errors">
            {current.errors.map((e) => (
              <li key={`${e.file}:${e.line}:${e.code}`}>
                {e.file}:{e.line} [{e.code}] {e.message}
              </li>
            ))}
          </ul>
        )}
        {current && (
          <FlowPlayer diagram={current.diagram} state={current.flowPlayerState} onChange={onFlowPlayerChange} />
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
                onNodeDoubleClick={(node) => void openDetails(node)}
                onNodeClick={onNodeClick}
                selectedNodeId={selectedNodeId}
                onDropNodeType={onDropNodeType}
                onConnectNodes={onConnectNodes}
                hoveredLinkIndex={hoveredLinkIndex}
                onEdgeHover={setHoveredLinkIndex}
                activeStep={highlight?.activeStep ?? undefined}
                visitedStepKeys={highlight?.visitedStepKeys}
              />
              {selectedNode && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: '#fff' }}>
                  <PropertiesPanel
                    node={selectedNode}
                    onUpdate={onUpdateSelectedNode}
                    onDelete={onDeleteSelectedNode}
                  />
                </div>
              )}
            </div>
            <LinksPanel
              links={current.diagram.links}
              hoveredLinkIndex={hoveredLinkIndex}
              onHoverLink={setHoveredLinkIndex}
              onUpdateLink={onUpdateLink}
              onDeleteLink={onDeleteLink}
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
        {!current && !loadError && <p>Drag a .dc.yaml file here, or use the file picker above.</p>}
      </main>
    </div>
  );
}
