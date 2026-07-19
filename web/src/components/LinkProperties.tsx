import type { DiagramLink } from '../types';
import type { EdgeStyleOverride } from '../edgeStyle';
import { TextStyleSection } from './TextStyleSection';

const LINK_TYPES = ['request', 'call', 'query', 'event', 'dataflow', 'inherits', 'contains'];

interface Props {
  link: DiagramLink;
  onUpdate: (patch: Partial<DiagramLink>) => void;
  onDelete: () => void;
  style?: EdgeStyleOverride;
  onUpdateStyle: (patch: Partial<EdgeStyleOverride>) => void;
  onResetStyle: () => void;
  onUpdateTextStyle: (patch: Partial<EdgeStyleOverride['text']>) => void;
  onResetTextStyle: () => void;
  labelHidden: boolean;
  onToggleLabelHidden: () => void;
}

/** Link properties (PLAN4.md step 12.6) — Properties panel's edge form,
 * shown when a link is selected (canvas click, or picking one from the
 * diagram overview's list). Mirrors `PropertiesPanel.tsx`'s node form:
 * same field-by-field commit pattern, same Style/Text sections. Carries
 * everything the pre-12.6 `LinksPanel`'s expanded row used to
 * (markers/line-style/width/color/label-visibility/reset), unbundled
 * from the old always-open row so it doesn't need per-row-indexed
 * testids anymore — only one link's properties are ever shown at once. */
export function LinkProperties({
  link,
  onUpdate,
  onDelete,
  style,
  onUpdateStyle,
  onResetStyle,
  onUpdateTextStyle,
  onResetTextStyle,
  labelHidden,
  onToggleLabelHidden,
}: Props) {
  return (
    <aside
      data-testid="link-properties-panel"
      style={{ padding: 'var(--dc-space-3)', borderLeft: '1px solid var(--dc-border)', minWidth: 220, color: 'var(--dc-text)' }}
    >
      <h3 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>
        Link: {link.from} → {link.to}
      </h3>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Type
        <select
          data-testid="link-edit-type"
          value={link.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        >
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Label
        <input
          data-testid="link-edit-label"
          value={link.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--dc-space-1)', marginBottom: 'var(--dc-space-2)' }}>
        <input type="checkbox" data-testid="link-edit-hide-label" checked={labelHidden} onChange={onToggleLabelHidden} />
        Hide this label
      </label>
      <hr style={{ border: 'none', borderTop: '1px solid var(--dc-border)', margin: 'var(--dc-space-3) 0' }} />
      <h4 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Style</h4>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Start marker
        <select
          data-testid="link-edit-marker-start"
          value={style?.markerStart ?? 'none'}
          onChange={(e) => onUpdateStyle({ markerStart: e.target.value as EdgeStyleOverride['markerStart'] })}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="none">none</option>
          <option value="arrow">arrow</option>
          <option value="open-arrow">open arrow</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        End marker
        <select
          data-testid="link-edit-marker-end"
          value={style?.markerEnd ?? 'arrow'}
          onChange={(e) => onUpdateStyle({ markerEnd: e.target.value as EdgeStyleOverride['markerEnd'] })}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="none">none</option>
          <option value="arrow">arrow</option>
          <option value="open-arrow">open arrow</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Line style
        <select
          data-testid="link-edit-line-style"
          value={style?.lineStyle ?? 'solid'}
          onChange={(e) => onUpdateStyle({ lineStyle: e.target.value as EdgeStyleOverride['lineStyle'] })}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Stroke width
        <select
          data-testid="link-edit-stroke-width"
          value={style?.strokeWidth ?? 1.5}
          onChange={(e) => onUpdateStyle({ strokeWidth: Number(e.target.value) })}
          style={{ display: 'block', width: '100%' }}
        >
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Color
        <input
          type="color"
          data-testid="link-edit-color"
          value={style?.color ?? '#333333'}
          onChange={(e) => onUpdateStyle({ color: e.target.value })}
          style={{ display: 'block' }}
        />
      </label>
      <button type="button" data-testid="link-reset-style" onClick={onResetStyle} disabled={!style} style={{ marginBottom: 'var(--dc-space-3)' }}>
        Reset style
      </button>
      <hr style={{ border: 'none', borderTop: '1px solid var(--dc-border)', margin: 'var(--dc-space-3) 0' }} />
      <TextStyleSection
        text={style?.text}
        onUpdate={onUpdateTextStyle}
        onReset={onResetTextStyle}
        testIdPrefix="link"
        defaultColor="#333333"
      />
      <br />
      <button type="button" data-testid="link-delete" onClick={onDelete}>
        Delete link
      </button>
    </aside>
  );
}
