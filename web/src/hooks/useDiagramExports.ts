import { useCallback, useState } from 'react';
import { generateContext } from '../wasmValidate';
import { buildLayoutFile, downloadLayoutFile, layoutFileName } from '../layoutFile';
import { computeFlowHighlight, flowStepFrames, resolveFlowSteps } from '../flowPlayer';
import { downloadBlob, renderDiagramSVGString, svgStringToPngBlob } from '../svgExport';
import { zipSync } from 'fflate';
import { encodeShareState, SHARE_URL_SIZE_LIMIT } from '../shareLink';
import type { DiagramLevel } from './useDiagramStack';

/** <file.dc.yaml> -> <file>, for naming exported PNG/zip/markdown files. */
function baseName(fileName: string): string {
  return fileName.replace(/\.dc\.yaml$/, '').replace(/\.ya?ml$/, '');
}

/** Every "produce a file/link from the current level" action: PNG,
 * flow-steps zip, AI-context markdown, layout export, and the
 * share-link. All read-only over `current` — none of them mutate the
 * document, so unlike the editing hook they need no queueing. */
export function useDiagramExports(current: DiagramLevel | null) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const onExportLayout = useCallback(() => {
    if (!current) return;
    downloadLayoutFile(layoutFileName(current.fileName), buildLayoutFile(current.positions));
  }, [current]);

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

  const onShare = useCallback(() => {
    if (!current) return;
    const layout = current.manualPositionIds.size > 0 ? buildLayoutFile(current.positions) : null;
    const { fragment, size } = encodeShareState({ fileName: current.fileName, yaml: current.rawText, layout });
    if (size > SHARE_URL_SIZE_LIMIT) {
      setShareError(
        `This diagram is too large to share as a link (${size} bytes, limit ${SHARE_URL_SIZE_LIMIT}). ` +
          'Try removing unused nodes/links, or share the file directly.',
      );
      setShareUrl(null);
      return;
    }
    setShareError(null);
    const url = `${window.location.origin}${window.location.pathname}${fragment}`;
    setShareUrl(url);
  }, [current]);

  return {
    shareUrl,
    shareError,
    onExportLayout,
    onExportPng,
    onExportFlowStepsZip,
    onExportContext,
    onShare,
  };
}
