// Command dc is the DiagramCore CLI.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/oleksii94/diagramcore/internal/validate"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: dc <command> [args]")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "validate":
		os.Exit(runValidate(os.Args[2:]))
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		os.Exit(2)
	}
}

type fileResult struct {
	File      string           `json:"file"`
	OK        bool             `json:"ok"`
	Errors    []validate.Error `json:"errors,omitempty"`
	ExecError string           `json:"exec_error,omitempty"`
}

func runValidate(args []string) int {
	fs := flag.NewFlagSet("validate", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "output machine-readable JSON")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	patterns := fs.Args()
	if len(patterns) == 0 {
		fmt.Fprintln(os.Stderr, "usage: dc validate [--json] <files...>")
		return 2
	}

	files := expandPatterns(patterns)

	var results []fileResult
	hadExecError := false
	hadValidationError := false
	okCount := 0

	for _, file := range files {
		errs, err := validate.ValidateFile(file)
		if err != nil {
			hadExecError = true
			results = append(results, fileResult{File: file, OK: false, ExecError: err.Error()})
			continue
		}
		results = append(results, fileResult{File: file, OK: len(errs) == 0, Errors: errs})
		if len(errs) == 0 {
			okCount++
		} else {
			hadValidationError = true
		}
	}

	if *jsonOut {
		printJSON(results)
	} else {
		printHuman(results, okCount, len(files))
	}

	switch {
	case hadExecError:
		return 2
	case hadValidationError:
		return 1
	default:
		return 0
	}
}

// expandPatterns resolves globs. A pattern with no glob metacharacters is
// kept as-is even if the file doesn't exist, so it surfaces as a per-file
// execution error rather than being silently dropped. A glob pattern that
// matches nothing is also kept as-is for the same reason.
func expandPatterns(patterns []string) []string {
	var files []string
	for _, p := range patterns {
		if !strings.ContainsAny(p, "*?[") {
			files = append(files, p)
			continue
		}
		matches, err := filepath.Glob(p)
		if err != nil || len(matches) == 0 {
			files = append(files, p)
			continue
		}
		sort.Strings(matches)
		files = append(files, matches...)
	}
	return files
}

func printHuman(results []fileResult, okCount, total int) {
	for _, r := range results {
		if r.ExecError != "" {
			fmt.Fprintf(os.Stderr, "%s: error: %s\n", r.File, r.ExecError)
			continue
		}
		for _, e := range r.Errors {
			fmt.Println(e.String())
		}
	}
	fmt.Printf("%d/%d files OK\n", okCount, total)
}

func printJSON(results []fileResult) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(results)
}
