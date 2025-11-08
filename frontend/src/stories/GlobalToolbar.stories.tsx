import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import GlobalToolbar from '../components/GlobalToolbar';

const meta: Meta<typeof GlobalToolbar> = {
  title: 'Layout/GlobalToolbar',
  component: GlobalToolbar,
};

export default meta;

type Story = StoryObj<typeof GlobalToolbar>;

export const DefaultToolbar: Story = {
  render: () => <GlobalToolbar />,
};
