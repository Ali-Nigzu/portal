import React from 'react';
import renderer from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { composeStories } from '@storybook/testing-react';
import { applyDesignTokens } from '../styles/designTokens';
import { GlobalControlsProvider } from '../context/GlobalControlsContext';

import * as AppShellStories from '../stories/AppShell.stories';
import * as HeaderStatusStripStories from '../stories/HeaderStatusStrip.stories';
import * as CardStories from '../stories/Card.stories';

applyDesignTokens();

describe('Storybook design baselines', () => {
  const originalWarn = console.warn;
  let warnSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00Z'));

    warnSpy = jest.spyOn(console, 'warn').mockImplementation((message?: unknown, ...args: unknown[]) => {
      if (typeof message === 'string' && message.includes('React Router Future Flag Warning')) {
        return;
      }

      originalWarn.apply(console, [message, ...args]);
    });
  });

  afterAll(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  const storyModules = [
    composeStories(AppShellStories),
    composeStories(HeaderStatusStripStories),
    composeStories(CardStories),
  ];

  storyModules.forEach((stories) => {
    Object.entries(stories).forEach(([storyName, Story]) => {
      it(`${storyName} matches snapshot`, () => {
        const tree = renderer
          .create(
            <MemoryRouter>
              <GlobalControlsProvider>
                <Story />
              </GlobalControlsProvider>
            </MemoryRouter>
          )
          .toJSON();

        expect(tree).toMatchSnapshot();
      });
    });
  });
});
