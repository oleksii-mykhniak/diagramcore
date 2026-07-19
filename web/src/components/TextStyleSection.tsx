import type { TextStyleOverride } from '../shapes';

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const DEFAULT_FONT_SIZE_NODE = 13;
const DEFAULT_FONT_SIZE_EDGE = 12;

interface Props {
  text?: TextStyleOverride;
  onUpdate: (patch: Partial<TextStyleOverride>) => void;
  onReset: () => void;
  /** Node labels support alignment; edge labels don't (no meaningful
   * axis) — omit to hide the align buttons (PLAN4.md step 12.5). */
  showAlign?: boolean;
  /** Distinguishes node vs. edge testids/default font size, since both
   * Properties (node) and Links (edge) panels render this section. */
  testIdPrefix: 'prop' | 'link';
  /** Links panel renders one row per link (`link-edit-*-${index}`
   * convention) — appended to every testid here so it matches, even
   * though only the selected row is ever expanded at once. */
  idSuffix?: string;
  defaultColor: string;
}

const buttonBase: React.CSSProperties = {
  padding: '2px 8px',
  border: '1px solid var(--dc-border)',
  borderRadius: 'var(--dc-radius-sm)',
  background: 'var(--dc-surface)',
  color: 'var(--dc-text)',
  cursor: 'pointer',
};

const buttonActive: React.CSSProperties = {
  ...buttonBase,
  background: 'var(--dc-accent)',
  color: '#ffffff',
  borderColor: 'var(--dc-accent)',
};

/** Text section shared by Properties (node label) and Links (edge label)
 * panels (PLAN4.md step 12.5) — font size, bold/italic toggles, color,
 * and (node-only) alignment, all editing a `TextStyleOverride` nested
 * under the caller's own style override. Reset here only drops `text`,
 * leaving fill/stroke/etc. untouched. */
export function TextStyleSection({ text, onUpdate, onReset, showAlign, testIdPrefix, idSuffix = '', defaultColor }: Props) {
  const defaultFontSize = testIdPrefix === 'prop' ? DEFAULT_FONT_SIZE_NODE : DEFAULT_FONT_SIZE_EDGE;
  return (
    <>
      <h4 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Text</h4>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Font size
        <select
          data-testid={`${testIdPrefix}-text-font-size${idSuffix}`}
          value={text?.fontSize ?? defaultFontSize}
          onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
          style={{ display: 'block', width: '100%' }}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 'var(--dc-space-1)', marginBottom: 'var(--dc-space-2)' }}>
        <button
          type="button"
          data-testid={`${testIdPrefix}-text-bold${idSuffix}`}
          aria-pressed={text?.bold ?? false}
          onClick={() => onUpdate({ bold: !text?.bold })}
          style={text?.bold ? buttonActive : buttonBase}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-text-italic${idSuffix}`}
          aria-pressed={text?.italic ?? false}
          onClick={() => onUpdate({ italic: !text?.italic })}
          style={text?.italic ? buttonActive : buttonBase}
        >
          <em>I</em>
        </button>
      </div>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Color
        <input
          type="color"
          data-testid={`${testIdPrefix}-text-color${idSuffix}`}
          value={text?.color ?? defaultColor}
          onChange={(e) => onUpdate({ color: e.target.value })}
          style={{ display: 'block' }}
        />
      </label>
      {showAlign && (
        <div style={{ display: 'flex', gap: 'var(--dc-space-1)', marginBottom: 'var(--dc-space-2)' }}>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              data-testid={`${testIdPrefix}-text-align-${a}${idSuffix}`}
              aria-pressed={(text?.align ?? 'center') === a}
              onClick={() => onUpdate({ align: a })}
              style={(text?.align ?? 'center') === a ? buttonActive : buttonBase}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        data-testid={`${testIdPrefix}-reset-text${idSuffix}`}
        onClick={onReset}
        disabled={!text}
        style={{ marginBottom: 'var(--dc-space-3)' }}
      >
        Reset text
      </button>
    </>
  );
}
