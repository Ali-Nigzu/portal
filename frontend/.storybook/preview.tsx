import type { Preview } from '@storybook/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import '../src/styles/VRMTheme.css';
import '../src/index.css';
import { GlobalControlsProvider } from '../src/context/GlobalControlsContext';
import { applyDesignTokens } from '../src/styles/designTokens';

applyDesignTokens();

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <GlobalControlsProvider>
          <Story />
        </GlobalControlsProvider>
      </MemoryRouter>
    ),
  ],
};

export default preview;
