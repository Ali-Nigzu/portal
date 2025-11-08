import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import HeaderStatusStrip from '../components/HeaderStatusStrip';

const meta: Meta<typeof HeaderStatusStrip> = {
  title: 'Layout/HeaderStatusStrip',
  component: HeaderStatusStrip,
};

export default meta;

type Story = StoryObj<typeof HeaderStatusStrip>;

export const DefaultStatus: Story = {
  render: () => <HeaderStatusStrip />,
};
