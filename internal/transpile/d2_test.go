package transpile

import (
	"context"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"oss.terrastruct.com/d2/d2graph"
	"oss.terrastruct.com/d2/d2layouts/d2dagrelayout"
	"oss.terrastruct.com/d2/d2lib"
	"oss.terrastruct.com/d2/lib/log"
	"oss.terrastruct.com/d2/lib/textmeasure"
	"oss.terrastruct.com/util-go/go2"

	"github.com/oleksii94/diagramcore/internal/parser"
)

var update = flag.Bool("update", false, "update golden files")

func compilesAsD2(t *testing.T, src string) {
	t.Helper()
	ruler, err := textmeasure.NewRuler()
	if err != nil {
		t.Fatalf("textmeasure.NewRuler: %v", err)
	}
	opts := &d2lib.CompileOptions{
		Layout: go2.Pointer("dagre"),
		LayoutResolver: func(engine string) (d2graph.LayoutGraph, error) {
			return d2dagrelayout.DefaultLayout, nil
		},
		Ruler: ruler,
	}
	ctx := log.WithDefault(context.Background())
	if _, _, err := d2lib.Compile(ctx, src, opts, nil); err != nil {
		t.Fatalf("d2lib.Compile failed: %v\n--- source ---\n%s", err, src)
	}
}

func TestToD2Golden(t *testing.T) {
	examples := []string{"auth-system", "oauth-detail", "payment-processing", "nested"}

	for _, name := range examples {
		t.Run(name, func(t *testing.T) {
			src := filepath.Join("..", "..", "examples", name+".dc.yaml")
			d, err := parser.Parse(src)
			if err != nil {
				t.Fatalf("Parse(%s) failed: %v", src, err)
			}
			got := ToD2(d)

			compilesAsD2(t, got)

			golden := filepath.Join("testdata", "golden", name+".d2")
			if *update {
				if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
					t.Fatalf("write golden file: %v", err)
				}
				return
			}
			want, err := os.ReadFile(golden)
			if err != nil {
				t.Fatalf("read golden file: %v (run `go test -update`)", err)
			}
			if got != string(want) {
				t.Errorf("D2 output for %s does not match golden file %s\n--- got ---\n%s\n--- want ---\n%s", name, golden, got, want)
			}
		})
	}
}

func TestToD2FlowHighlightsPathDifferently(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	// "Пряма авторизація логін/пароль" doesn't touch OAuthProvider or its
	// link, so it exercises both the highlight and the muted styling.
	flow := &d.Flows[1]

	got := ToD2Flow(d, flow)
	compilesAsD2(t, got)

	if !strings.Contains(got, "style.stroke: \"#e04b4b\"") {
		t.Error("flow output missing highlight stroke style for on-path edges/nodes")
	}
	if !strings.Contains(got, "style.opacity: 0.35") {
		t.Error("flow output missing muted opacity style for off-path edges/nodes")
	}

	base := ToD2(d)
	if got == base {
		t.Error("flow-highlighted D2 output is identical to the base output")
	}
}

func TestFlowStepFramesPlainSteps(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	frames := FlowStepFrames(&d.Flows[0])
	if len(frames) != 6 {
		t.Fatalf("got %d frames, want 6", len(frames))
	}
	for i, f := range frames {
		if f.Position != i+1 {
			t.Errorf("frame %d: Position = %d, want %d", i, f.Position, i+1)
		}
		if f.BranchArm != "" {
			t.Errorf("frame %d: BranchArm = %q, want \"\"", i, f.BranchArm)
		}
		if len(f.Cumulative) != i+1 {
			t.Errorf("frame %d: len(Cumulative) = %d, want %d", i, len(f.Cumulative), i+1)
		}
	}
}

func TestFlowStepFramesBranchArms(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "payment-processing.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	frames := FlowStepFrames(&d.Flows[0])

	type want struct {
		pos        int
		arm        string
		cumulative int
	}
	wants := []want{
		{1, "", 1},
		{2, "", 2},
		{3, "", 3},
		{4, "a", 4}, // 3 plain steps + 1 then step
		{4, "b", 5}, // 3 plain steps + 2 else steps
	}
	if len(frames) != len(wants) {
		t.Fatalf("got %d frames, want %d", len(frames), len(wants))
	}
	for i, w := range wants {
		f := frames[i]
		if f.Position != w.pos || f.BranchArm != w.arm || len(f.Cumulative) != w.cumulative {
			t.Errorf("frame %d: got {pos:%d arm:%q cumulative:%d}, want {pos:%d arm:%q cumulative:%d}",
				i, f.Position, f.BranchArm, len(f.Cumulative), w.pos, w.arm, w.cumulative)
		}
	}
}
