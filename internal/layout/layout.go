// Package layout reads and writes <name>.layout.json sidecar files: manual
// node positions that survive re-renders, per docs/format.md.
package layout

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Position is a node's top-left coordinate in SVG/D2 canvas units.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// View holds the positions for one named view. v0 only uses "default".
type View struct {
	Positions map[string]Position `json:"positions"`
	// NotePositions holds free-text annotation positions (phase 10, step
	// 10.11) — written by the web editor, not by this package's Save;
	// round-tripped so `dc render --write-layout` doesn't clobber them.
	NotePositions map[string]Position `json:"notePositions,omitempty"`
}

// File is the decoded contents of a <name>.layout.json file.
type File struct {
	Views map[string]View `json:"views"`
	// RenderStyle is the diagram style preset (phase 10, step 10.12),
	// written by the web editor. Round-tripped for the same reason as
	// NotePositions above; unused by `dc render`.
	RenderStyle string `json:"renderStyle,omitempty"`
}

// DefaultView is the only view name used in v0.
const DefaultView = "default"

// PathFor returns the layout sidecar path for a *.dc.yaml file: the same
// directory, with the .dc.yaml extension replaced by .layout.json.
func PathFor(diagramPath string) string {
	if strings.HasSuffix(diagramPath, ".dc.yaml") {
		return strings.TrimSuffix(diagramPath, ".dc.yaml") + ".layout.json"
	}
	return diagramPath + ".layout.json"
}

// Load reads and decodes the layout file at path. If the file does not
// exist, Load returns (nil, nil): no layout is not an error.
func Load(path string) (*File, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var f File
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &f, nil
}

// Positions returns the position map for the given view (DefaultView in
// v0), or nil if the file or that view has none.
func (f *File) Positions(view string) map[string]Position {
	if f == nil {
		return nil
	}
	return f.Views[view].Positions
}

// UnknownNodeWarnings returns one warning string per id in the given view's
// positions that is not present in knownNodeIDs: the layout file has
// drifted from the diagram's current node set. This is a warning, not a
// validation error (docs/format.md).
func (f *File) UnknownNodeWarnings(view string, knownNodeIDs map[string]bool) []string {
	var warnings []string
	for id := range f.Positions(view) {
		if !knownNodeIDs[id] {
			warnings = append(warnings, fmt.Sprintf("layout position for unknown node %q (not in diagram)", id))
		}
	}
	return warnings
}

// Save writes positions as the DefaultView of a layout file at path,
// preserving any web-editor-only fields (NotePositions, RenderStyle)
// already present in an existing file at that path rather than clobbering
// them — `dc render --write-layout` only ever computes node positions.
func Save(path string, positions map[string]Position) error {
	f := File{Views: map[string]View{
		DefaultView: {Positions: positions},
	}}
	if existing, err := Load(path); err != nil {
		return err
	} else if existing != nil {
		f.RenderStyle = existing.RenderStyle
		if v, ok := existing.Views[DefaultView]; ok {
			f.Views[DefaultView] = View{Positions: positions, NotePositions: v.NotePositions}
		}
	}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return fmt.Errorf("encode layout: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}
