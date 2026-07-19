import { useEffect, useRef } from 'react';

export interface NodeContextMenuState {
  x: number;
  y: number;
}

interface Props {
  state: NodeContextMenuState;
  onClose: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  onGroup?: () => void;
  onUngroup?: () => void;
  canAlign?: boolean;
  canDistribute?: boolean;
  onAlign?: (edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute?: (axis: 'horizontal' | 'vertical') => void;
}

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 'var(--dc-space-2) var(--dc-space-3)',
  cursor: 'pointer',
  color: 'var(--dc-text)',
  fontSize: 'var(--dc-font-size-base)',
  whiteSpace: 'nowrap',
};

/** Right-click context menu on a canvas node (PLAN4.md step 12.9,
 * "minimal" per plan — z-order + Delete/Duplicate; grows in later
 * steps). Closes on Escape, outside click, or any action. */
export function NodeContextMenu({
  state,
  onClose,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onDelete,
  onDuplicate,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
  canAlign,
  canDistribute,
  onAlign,
  onDistribute,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const runAndClose = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      data-testid="node-context-menu"
      role="menu"
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 1000,
        background: 'var(--dc-surface)',
        border: '1px solid var(--dc-border)',
        borderRadius: 'var(--dc-radius-sm)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        minWidth: 180,
        padding: 'var(--dc-space-1) 0',
      }}
    >
      <button type="button" role="menuitem" data-testid="context-bring-to-front" style={itemStyle} onClick={runAndClose(onBringToFront)}>
        Bring to front
      </button>
      <button type="button" role="menuitem" data-testid="context-bring-forward" style={itemStyle} onClick={runAndClose(onBringForward)}>
        Bring forward
      </button>
      <button type="button" role="menuitem" data-testid="context-send-backward" style={itemStyle} onClick={runAndClose(onSendBackward)}>
        Send backward
      </button>
      <button type="button" role="menuitem" data-testid="context-send-to-back" style={itemStyle} onClick={runAndClose(onSendToBack)}>
        Send to back
      </button>
      {(onGroup || onUngroup) && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--dc-border)', margin: 'var(--dc-space-1) 0' }} />
          {onGroup && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-group"
              style={canGroup ? itemStyle : { ...itemStyle, color: 'var(--dc-text-muted)', cursor: 'default' }}
              disabled={!canGroup}
              onClick={runAndClose(onGroup)}
            >
              Group
            </button>
          )}
          {onUngroup && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-ungroup"
              style={canUngroup ? itemStyle : { ...itemStyle, color: 'var(--dc-text-muted)', cursor: 'default' }}
              disabled={!canUngroup}
              onClick={runAndClose(onUngroup)}
            >
              Ungroup
            </button>
          )}
        </>
      )}
      {onAlign && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--dc-border)', margin: 'var(--dc-space-1) 0' }} />
          {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((edge) => (
            <button
              key={edge}
              type="button"
              role="menuitem"
              data-testid={`context-align-${edge}`}
              style={canAlign ? itemStyle : { ...itemStyle, color: 'var(--dc-text-muted)', cursor: 'default' }}
              disabled={!canAlign}
              onClick={runAndClose(() => onAlign(edge))}
            >
              Align {edge}
            </button>
          ))}
        </>
      )}
      {onDistribute && (
        <>
          {(['horizontal', 'vertical'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              role="menuitem"
              data-testid={`context-distribute-${axis}`}
              style={canDistribute ? itemStyle : { ...itemStyle, color: 'var(--dc-text-muted)', cursor: 'default' }}
              disabled={!canDistribute}
              onClick={runAndClose(() => onDistribute(axis))}
            >
              Distribute {axis}
            </button>
          ))}
        </>
      )}
      <hr style={{ border: 'none', borderTop: '1px solid var(--dc-border)', margin: 'var(--dc-space-1) 0' }} />
      <button type="button" role="menuitem" data-testid="context-duplicate" style={itemStyle} onClick={runAndClose(onDuplicate)}>
        Duplicate
      </button>
      <button type="button" role="menuitem" data-testid="context-delete" style={itemStyle} onClick={runAndClose(onDelete)}>
        Delete
      </button>
    </div>
  );
}
