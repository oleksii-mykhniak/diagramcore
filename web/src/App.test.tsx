import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./wasmValidate', () => ({
  validateDiagram: vi.fn(async () => []),
  generateContext: vi.fn(async () => '# Example\n'),
}));

const yamlText = `
diagram:
  title: "Example"
nodes:
  - id: User
    type: actor
  - id: Gateway
    type: service
links:
  - from: User
    to: Gateway
    type: request
`;

describe('App', () => {
  it('shows the file picker before anything is opened', () => {
    render(<App />);
    expect(screen.getByTestId('file-input')).toBeInTheDocument();
    expect(screen.queryByTestId('reactflow-canvas')).not.toBeInTheDocument();
  });

  it('renders the diagram after a file is opened', async () => {
    render(<App />);
    const file = new File([yamlText], 'example.dc.yaml', { type: 'application/x-yaml' });
    const input = screen.getByTestId('file-input');
    await userEvent.upload(input, file);

    await waitFor(() => expect(screen.getByTestId('reactflow-canvas')).toBeInTheDocument());
    expect(screen.getByTestId('rf-node-User')).toBeInTheDocument();
    expect(screen.getByTestId('rf-node-Gateway')).toBeInTheDocument();
  });

  it('shows export controls once a diagram is open, with the flow-steps export disabled until a flow is selected', async () => {
    render(<App />);
    const file = new File([yamlText], 'example.dc.yaml', { type: 'application/x-yaml' });
    await userEvent.upload(screen.getByTestId('file-input'), file);
    await waitFor(() => expect(screen.getByTestId('reactflow-canvas')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('menu-trigger-file'));
    expect(screen.getByTestId('export-png')).toBeEnabled();
    expect(screen.getByTestId('export-context')).toBeEnabled();
    expect(screen.getByTestId('export-flow-steps-zip')).toBeDisabled();
  });
});
