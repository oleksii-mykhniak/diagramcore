import type { ExportSettings } from '../hooks/useExportSettings';

interface ExportDialogProps {
  settings: ExportSettings;
  onChange: (patch: Partial<ExportSettings>) => void;
  onCancel: () => void;
  onExport: () => void;
}

const dialogStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const panelStyle: React.CSSProperties = {
  background: 'var(--dc-surface)',
  color: 'var(--dc-text)',
  border: '1px solid var(--dc-border)',
  borderRadius: 'var(--dc-radius-md)',
  boxShadow: 'var(--dc-shadow)',
  padding: 'var(--dc-space-4)',
  minWidth: 280,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--dc-space-3)',
};

/** File → "Export image…" dialog (PLAN.md step 10.9): format (PNG/JPG/
 * SVG), scale (1x/2x/4x — multiplies the rasterized canvas size, the
 * SVG `viewBox` never changes), background (transparent unavailable for
 * JPG, which has no alpha channel), and "include grid". Settings persist
 * via `useExportSettings` and are also used by "Export flow steps (zip)". */
export function ExportDialog({ settings, onChange, onCancel, onExport }: ExportDialogProps) {
  const isJpg = settings.format === 'jpg';

  return (
    <div data-testid="export-dialog" style={dialogStyle} onClick={onCancel}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 'var(--dc-font-size-lg)' }}>Export image</h2>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Format
          <select
            data-testid="export-format"
            value={settings.format}
            onChange={(e) => {
              const format = e.target.value as ExportSettings['format'];
              onChange({ format, background: format === 'jpg' && settings.background === 'transparent' ? 'white' : settings.background });
            }}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="svg">SVG</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Scale
          <select
            data-testid="export-scale"
            value={settings.scale}
            disabled={settings.format === 'svg'}
            onChange={(e) => onChange({ scale: Number(e.target.value) as ExportSettings['scale'] })}
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Background
          <select
            data-testid="export-background"
            value={settings.background}
            onChange={(e) => onChange({ background: e.target.value as ExportSettings['background'] })}
          >
            <option value="transparent" disabled={isJpg}>
              Transparent{isJpg ? ' (unavailable for JPG)' : ''}
            </option>
            <option value="white">White</option>
            <option value="theme">Theme</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--dc-space-2)' }}>
          <input
            type="checkbox"
            data-testid="export-include-grid"
            checked={settings.includeGrid}
            onChange={(e) => onChange({ includeGrid: e.target.checked })}
          />
          Include grid
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--dc-space-2)' }}>
          <button type="button" data-testid="export-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" data-testid="export-confirm" onClick={onExport}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
