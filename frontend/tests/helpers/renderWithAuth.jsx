import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';

/**
 * Render component with AuthContext and Router for testing
 */
export function renderWithAuth(ui, { user = null, ...options } = {}) {
  const mockAuthValue = {
    user: user || {
      id: 1,
      email: 'test@example.com',
      openaiConfigured: false,
      openaiModel: 'gpt-5.4-mini',
    },
    freelancer: {
      connected: false,
      expired: false,
      username: null,
    },
    loading: false,
    updateSettings: vi.fn(),
    connectFreelancer: vi.fn(),
    disconnectFreelancer: vi.fn(),
    fetchStatus: vi.fn(),
  };

  function Wrapper({ children }) {
    return (
      <BrowserRouter>
        <AuthProvider value={mockAuthValue}>
          {children}
        </AuthProvider>
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
