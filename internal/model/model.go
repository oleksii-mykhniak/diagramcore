// Package model defines the in-memory representation of a DiagramCore
// (*.dc.yaml) file, as specified in docs/format.md, and knows how to decode
// itself from YAML while preserving source line numbers for diagnostics.
package model

import "gopkg.in/yaml.v3"

// Diagram is the root of a parsed *.dc.yaml file.
type Diagram struct {
	Meta  DiagramMeta `yaml:"diagram"`
	Nodes []Node      `yaml:"nodes"`
	Links []Link      `yaml:"links"`
	Flows []Flow      `yaml:"flows"`

	// Path is the absolute, canonical path of the file this diagram was
	// parsed from. Set by the parser; used for details-reference traversal.
	Path string `yaml:"-"`
}

// DiagramMeta holds the `diagram` section.
type DiagramMeta struct {
	Title       string   `yaml:"title"`
	Purpose     string   `yaml:"purpose"`
	Audience    string   `yaml:"audience"`
	Version     string   `yaml:"version"`
	CustomTypes []string `yaml:"custom_types"`
	Line        int      `yaml:"-"`
}

func (m *DiagramMeta) UnmarshalYAML(value *yaml.Node) error {
	type raw DiagramMeta
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	*m = DiagramMeta(aux)
	m.Line = value.Line
	return nil
}

// Node is one entry of the `nodes` section.
type Node struct {
	ID          string   `yaml:"id"`
	Type        string   `yaml:"type"`
	Label       string   `yaml:"label"`
	Description string   `yaml:"description"`
	AIContext   string   `yaml:"ai_context"`
	Tags        []string `yaml:"tags"`
	Details     string   `yaml:"details"`
	Line        int      `yaml:"-"`
}

func (n *Node) UnmarshalYAML(value *yaml.Node) error {
	type raw Node
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	*n = Node(aux)
	n.Line = value.Line
	return nil
}

// Link is one entry of the `links` section.
type Link struct {
	From     string `yaml:"from"`
	To       string `yaml:"to"`
	Type     string `yaml:"type"`
	Label    string `yaml:"label"`
	Directed bool   `yaml:"-"`
	Line     int    `yaml:"-"`
}

func (l *Link) UnmarshalYAML(value *yaml.Node) error {
	type raw struct {
		From     string `yaml:"from"`
		To       string `yaml:"to"`
		Type     string `yaml:"type"`
		Label    string `yaml:"label"`
		Directed *bool  `yaml:"directed"`
	}
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	l.From = aux.From
	l.To = aux.To
	l.Type = aux.Type
	l.Label = aux.Label
	l.Directed = aux.Directed == nil || *aux.Directed
	l.Line = value.Line
	return nil
}

// Flow is one entry of the `flows` section.
type Flow struct {
	Name  string         `yaml:"name"`
	Steps []StepOrBranch `yaml:"steps"`
	Line  int            `yaml:"-"`
}

func (f *Flow) UnmarshalYAML(value *yaml.Node) error {
	type raw Flow
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	*f = Flow(aux)
	f.Line = value.Line
	return nil
}

// StepOrBranch is one element of a flow's `steps` list: either a Step or a
// Branch, mutually exclusive (enforced at the JSON Schema level and
// re-checked by the parser).
type StepOrBranch struct {
	Step   *Step
	Branch *Branch
	Line   int
}

func (sb *StepOrBranch) UnmarshalYAML(value *yaml.Node) error {
	type raw struct {
		From   *string `yaml:"from"`
		To     *string `yaml:"to"`
		Note   string  `yaml:"note"`
		Branch *Branch `yaml:"branch"`
	}
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	sb.Line = value.Line
	if aux.Branch != nil {
		sb.Branch = aux.Branch
		return nil
	}
	sb.Step = &Step{Line: value.Line}
	if aux.From != nil {
		sb.Step.From = *aux.From
	}
	if aux.To != nil {
		sb.Step.To = *aux.To
	}
	sb.Step.Note = aux.Note
	return nil
}

// Step is a plain flow step: a single from -> to hop.
type Step struct {
	From string `yaml:"from"`
	To   string `yaml:"to"`
	Note string `yaml:"note"`
	Line int    `yaml:"-"`
}

func (s *Step) UnmarshalYAML(value *yaml.Node) error {
	type raw Step
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	*s = Step(aux)
	s.Line = value.Line
	return nil
}

// Branch is a conditional flow step.
type Branch struct {
	Condition string `yaml:"condition"`
	Then      []Step `yaml:"then"`
	Else      []Step `yaml:"else"`
	Line      int    `yaml:"-"`
}

func (b *Branch) UnmarshalYAML(value *yaml.Node) error {
	type raw Branch
	var aux raw
	if err := value.Decode(&aux); err != nil {
		return err
	}
	*b = Branch(aux)
	b.Line = value.Line
	return nil
}
