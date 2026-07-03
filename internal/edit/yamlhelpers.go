package edit

import (
	"fmt"

	"gopkg.in/yaml.v3"
)

// mapGet returns the value node for key in mapping m, or nil if absent.
// m.Content alternates key, value, key, value, ...
func mapGet(m *yaml.Node, key string) *yaml.Node {
	if m == nil || m.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i+1]
		}
	}
	return nil
}

// mapGetScalar is mapGet for the common case of a plain scalar value.
func mapGetScalar(m *yaml.Node, key string) string {
	v := mapGet(m, key)
	if v == nil {
		return ""
	}
	return v.Value
}

// setMapField sets key to a scalar value, replacing the value node if the
// key exists or appending a new key/value pair at the end otherwise.
func setMapField(m *yaml.Node, key string, value string) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			m.Content[i+1] = scalar(value)
			return
		}
	}
	m.Content = append(m.Content, scalar(key), scalar(value))
}

// applyPatch merges patch into mapping m: a nil value deletes the key
// (matching web/src/yamlPatch.ts's updateNode/updateFlowStep semantics),
// anything else sets/replaces it. Values are re-encoded through
// yaml.Node's own Encode so slices ([]string tags, etc.) come out with
// the same representation add_node/add_link would produce.
func applyPatch(m *yaml.Node, patch map[string]any) {
	for key, value := range patch {
		if value == nil {
			deleteMapField(m, key)
			continue
		}
		var valueNode yaml.Node
		if err := valueNode.Encode(value); err != nil {
			continue
		}
		setMapFieldNode(m, key, &valueNode)
	}
}

func setMapFieldNode(m *yaml.Node, key string, value *yaml.Node) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			m.Content[i+1] = value
			return
		}
	}
	m.Content = append(m.Content, scalar(key), value)
}

func deleteMapField(m *yaml.Node, key string) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			m.Content = append(m.Content[:i], m.Content[i+2:]...)
			return
		}
	}
}

func scalar(s string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: s}
}

// seqField returns the sequence node at key within mapping m.
func seqField(m *yaml.Node, key string) (*yaml.Node, error) {
	v := mapGet(m, key)
	if v == nil || v.Kind != yaml.SequenceNode {
		return nil, fmt.Errorf("no %s[] section", key)
	}
	return v, nil
}

// findByField returns the first mapping in the sequence at seqKey whose
// idField scalar equals idValue (e.g. seqKey="nodes", idField="id").
func findByField(root *yaml.Node, seqKey, idField, idValue string) (*yaml.Node, error) {
	seq, err := seqField(root, seqKey)
	if err != nil {
		return nil, err
	}
	for _, item := range seq.Content {
		if mapGetScalar(item, idField) == idValue {
			return item, nil
		}
	}
	return nil, fmt.Errorf("no %s with %s %q", seqKey, idField, idValue)
}

func indexByField(seq *yaml.Node, field, value string) (int, error) {
	for i, item := range seq.Content {
		if mapGetScalar(item, field) == value {
			return i, nil
		}
	}
	return -1, fmt.Errorf("no item with %s %q", field, value)
}

func nodeSpecToYAML(n NodeSpec) *yaml.Node {
	m := &yaml.Node{Kind: yaml.MappingNode}
	m.Content = append(m.Content, scalar("id"), scalar(n.ID))
	m.Content = append(m.Content, scalar("type"), scalar(n.Type))
	if n.Label != "" {
		m.Content = append(m.Content, scalar("label"), scalar(n.Label))
	}
	if n.Description != "" {
		m.Content = append(m.Content, scalar("description"), scalar(n.Description))
	}
	if n.AIContext != "" {
		m.Content = append(m.Content, scalar("ai_context"), scalar(n.AIContext))
	}
	if len(n.Tags) > 0 {
		var tags yaml.Node
		_ = tags.Encode(n.Tags)
		m.Content = append(m.Content, scalar("tags"), &tags)
	}
	if n.Details != "" {
		m.Content = append(m.Content, scalar("details"), scalar(n.Details))
	}
	return m
}

func linkSpecToYAML(l LinkSpec) *yaml.Node {
	m := &yaml.Node{Kind: yaml.MappingNode}
	m.Content = append(m.Content, scalar("from"), scalar(l.From))
	m.Content = append(m.Content, scalar("to"), scalar(l.To))
	m.Content = append(m.Content, scalar("type"), scalar(l.Type))
	if l.Label != "" {
		m.Content = append(m.Content, scalar("label"), scalar(l.Label))
	}
	if l.Directed != nil {
		var v yaml.Node
		_ = v.Encode(*l.Directed)
		m.Content = append(m.Content, scalar("directed"), &v)
	}
	return m
}

func stepSpecToYAML(s StepSpec) *yaml.Node {
	m := &yaml.Node{Kind: yaml.MappingNode}
	m.Content = append(m.Content, scalar("from"), scalar(s.From))
	m.Content = append(m.Content, scalar("to"), scalar(s.To))
	if s.Note != "" {
		m.Content = append(m.Content, scalar("note"), scalar(s.Note))
	}
	return m
}
