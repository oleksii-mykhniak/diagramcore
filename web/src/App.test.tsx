import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./wasmValidate', () => ({
  validateDiagram: vi.fn(async () => []),
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
    expect(screen.queryByTestId('diagram-svg')).not.toBeInTheDocument();
  });

  it('renders the diagram after a file is opened', async () => {
    render(<App />);
    const file = new File([yamlText], 'example.dc.yaml', { type: 'application/x-yaml' });
    const input = screen.getByTestId('file-input');
    await userEvent.upload(input, file);

    await waitFor(() => expect(screen.getByTestId('diagram-svg')).toBeInTheDocument());
    expect(screen.getByTestId('node-User')).toBeInTheDocument();
    expect(screen.getByTestId('node-Gateway')).toBeInTheDocument();
    expect(screen.getByTestId('edge-User-Gateway')).toBeInTheDocument();
  });
});
