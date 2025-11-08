import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import VRMLayout from '../components/VRMLayout';

const meta: Meta<typeof VRMLayout> = {
  title: 'Layout/AppShell',
  component: VRMLayout,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    userRole: 'client',
  },
};

export default meta;

type Story = StoryObj<typeof VRMLayout>;

export const DefaultShell: Story = {
  render: (args) => (
    <VRMLayout {...args}>
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Sample card</h3>
        </div>
        <div className="vrm-card-body">
          The unified shell keeps the sidebar, header strip, and toolbar pinned.
        </div>
      </div>
    </VRMLayout>
  ),
};
