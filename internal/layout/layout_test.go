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
				Positions:     map[string]Position{"User": {X: 0, Y: 0}},
				NotePositions: map[string]Position{"note1": {X: 40, Y: 40}},
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
