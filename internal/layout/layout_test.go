package layout

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestPathFor(t *testing.T) {
	got := PathFor("examples/auth-system.dc.yaml")
	want := "examples/auth-system.layout.json"
	if got != want {
		t.Errorf("PathFor = %q, want %q", got, want)
	}
}

func TestLoadMissingFileIsNotAnError(t *testing.T) {
	f, err := Load(filepath.Join(t.TempDir(), "does-not-exist.layout.json"))
	if err != nil {
		t.Fatalf("Load of a missing file returned an error: %v", err)
	}
	if f != nil {
		t.Errorf("Load of a missing file returned non-nil: %+v", f)
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth-system.layout.json")
	want := map[string]Position{
		"User":    {X: 0, Y: 0},
		"Gateway": {X: 200, Y: 50},
	}
	if err := Save(path, want); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	f, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	got := f.Positions(DefaultView)
	if len(got) != len(want) {
		t.Fatalf("got %d positions, want %d", len(got), len(want))
	}
	for id, wantPos := range want {
		gotPos, ok := got[id]
		if !ok {
			t.Errorf("missing position for %q", id)
			continue
		}
		if gotPos != wantPos {
			t.Errorf("position for %q = %+v, want %+v", id, gotPos, wantPos)
		}
	}
}

func TestSavePreservesWebEditorOnlyFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth-system.layout.json")
	seed := File{
		Views: map[string]View{
			DefaultView: {
				Positions:        map[string]Position{"User": {X: 0, Y: 0}},
				NotePositions:    map[string]Position{"note1": {X: 40, Y: 40}},
				Styles:           map[string]Style{"User": {Fill: "#ff00ff", Text: &TextStyle{FontSize: 18, Bold: true, Align: "center"}}},
				EdgeStyles:       map[string]EdgeStyle{"User->Gateway:request": {MarkerEnd: "open-arrow", Color: "#123456", Text: &TextStyle{Italic: true, Color: "#abcdef"}}},
				EdgeLabelOffsets: map[string]Position{"User->Gateway:request": {X: 10, Y: -5}},
				HiddenEdgeLabels: []string{"User->Gateway:request"},
				HiddenEdges:      []string{"Gateway->AuthService:call"},
				HiddenNodeLabels: []string{"DB"},
				ZOrder:           []string{"DB", "Gateway", "User"},
			},
		},
		RenderStyle: "sketch",
	}
	data, err := json.MarshalIndent(seed, "", "  ")
	if err != nil {
		t.Fatalf("marshal seed: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}

	if err := Save(path, map[string]Position{"User": {X: 200, Y: 50}}); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	f, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if f.RenderStyle != "sketch" {
		t.Errorf("RenderStyle = %q, want preserved %q", f.RenderStyle, "sketch")
	}
	if got := f.Views[DefaultView].NotePositions["note1"]; got != (Position{X: 40, Y: 40}) {
		t.Errorf("NotePositions[note1] = %+v, want preserved {40 40}", got)
	}
	if got := f.Positions(DefaultView)["User"]; got != (Position{X: 200, Y: 50}) {
		t.Errorf("Positions[User] = %+v, want the newly-saved {200 50}", got)
	}
	view := f.Views[DefaultView]
	if got := view.Styles["User"]; got.Fill != "#ff00ff" || got.Text == nil || got.Text.FontSize != 18 || !got.Text.Bold || got.Text.Align != "center" {
		t.Errorf("Styles[User] = %+v, want preserved fill+text override", got)
	}
	edgeStyle := view.EdgeStyles["User->Gateway:request"]
	if edgeStyle.MarkerEnd != "open-arrow" || edgeStyle.Color != "#123456" {
		t.Errorf("EdgeStyles[User->Gateway:request] = %+v, want preserved {open-arrow  0 #123456 <text>}", edgeStyle)
	}
	if edgeStyle.Text == nil || !edgeStyle.Text.Italic || edgeStyle.Text.Color != "#abcdef" {
		t.Errorf("EdgeStyles[User->Gateway:request].Text = %+v, want preserved {italic:true color:#abcdef}", edgeStyle.Text)
	}
	if got := view.EdgeLabelOffsets["User->Gateway:request"]; got != (Position{X: 10, Y: -5}) {
		t.Errorf("EdgeLabelOffsets[User->Gateway:request] = %+v, want preserved {10 -5}", got)
	}
	if len(view.HiddenEdgeLabels) != 1 || view.HiddenEdgeLabels[0] != "User->Gateway:request" {
		t.Errorf("HiddenEdgeLabels = %v, want preserved [User->Gateway:request]", view.HiddenEdgeLabels)
	}
	if len(view.HiddenEdges) != 1 || view.HiddenEdges[0] != "Gateway->AuthService:call" {
		t.Errorf("HiddenEdges = %v, want preserved [Gateway->AuthService:call]", view.HiddenEdges)
	}
	if len(view.HiddenNodeLabels) != 1 || view.HiddenNodeLabels[0] != "DB" {
		t.Errorf("HiddenNodeLabels = %v, want preserved [DB]", view.HiddenNodeLabels)
	}
	wantZOrder := []string{"DB", "Gateway", "User"}
	if len(view.ZOrder) != len(wantZOrder) {
		t.Errorf("ZOrder = %v, want preserved %v", view.ZOrder, wantZOrder)
	} else {
		for i, id := range wantZOrder {
			if view.ZOrder[i] != id {
				t.Errorf("ZOrder[%d] = %q, want %q", i, view.ZOrder[i], id)
			}
		}
	}
}

func TestUnknownNodeWarnings(t *testing.T) {
	f := &File{Views: map[string]View{
		DefaultView: {Positions: map[string]Position{
			"User":  {X: 0, Y: 0},
			"Ghost": {X: 1, Y: 1},
		}},
	}}
	known := map[string]bool{"User": true, "Gateway": true}
	warnings := f.UnknownNodeWarnings(DefaultView, known)
	if len(warnings) != 1 {
		t.Fatalf("got %d warnings, want 1: %v", len(warnings), warnings)
	}
}
