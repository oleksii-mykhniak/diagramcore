import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import yaml from 'js-yaml';
import { parseDiagram } from '../parseDiagram';

interface YamlError {
  message: string;
  line?: number;
}

function checkValid(text: string): YamlError | null {
  try {
    yaml.load(text);
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      return { message: err.reason, line: err.mark ? err.mark.line + 1 : undefined };
    }
    return { message: err instanceof Error ? err.message : String(err) };
  }
  try {
    parseDiagram(text);
  } catch (err) {
    return { message: err instanceof Error ? err.message : String(err) };
  }
  return null;
}

/** Length of the common prefix/suffix between two strings, used to turn a
 * whole-document replace into the smallest possible CodeMirror change —
 * so a cursor/selection outside the changed range survives the update
 * (PLAN.md step 7.5). */
function diffRange(oldText: string, newText: string): { from: number; to: number; insert: string } {
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(oldText.length, newText.length) - prefix;
  while (suffix < maxSuffix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++;
  return {
    from: prefix,
    to: oldText.length - suffix,
    insert: newText.slice(prefix, newText.length - suffix),
  };
}

interface Props {
  text: string;
  onCommit: (text: string) => void;
}

const DEBOUNCE_MS = 300;

/** Two-way YAML editor panel (PLAN.md step 7.5): edits in the panel are
 * debounced, syntax/shape-checked, and only committed to the app (which
 * re-derives the canvas) when valid; visual edits from the canvas flow
 * back in as minimal, cursor-preserving CodeMirror changes. Invalid input
 * simply isn't committed — the canvas keeps showing the last valid
 * state, and the panel shows an inline error instead. */
export function YamlPanel({ text, onCommit }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastCommittedRef = useRef(text);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<YamlError | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      doc: text,
      extensions: [
        basicSetup,
        yamlLang(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const value = update.state.doc.toString();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            const invalid = checkValid(value);
            setError(invalid);
            if (!invalid) {
              lastCommittedRef.current = value;
              onCommit(value);
            }
          }, DEBOUNCE_MS);
        }),
      ],
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      view.destroy();
    };
    // Only mount once; external `text` changes are synced in the effect
    // below rather than by recreating the editor (that would lose focus
    // and cursor position on every keystroke-triggered parent re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (text === lastCommittedRef.current) return;
    const current = view.state.doc.toString();
    if (current === text) {
      lastCommittedRef.current = text;
      return;
    }
    const change = diffRange(current, text);
    view.dispatch({ changes: change });
    lastCommittedRef.current = text;
  }, [text]);

  return (
    <div>
      <div data-testid="yaml-panel" ref={containerRef} />
      {error && (
        <p data-testid="yaml-panel-error" role="alert">
          {error.line !== undefined ? `Line ${error.line}: ` : ''}
          {error.message}
        </p>
      )}
    </div>
  );
}
