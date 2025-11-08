import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

const meta: Meta = {
  title: 'Layout/Card',
};

export default meta;

type Story = StoryObj;

export const StandardCard: Story = {
  render: () => (
    <div className="vrm-card" style={{ maxWidth: '480px' }}>
      <div className="vrm-card-header">
        <h3 className="vrm-card-title">Card baseline</h3>
        <div className="vrm-card-actions">
          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" type="button">
            Action
          </button>
        </div>
      </div>
      <div className="vrm-card-body">
        Card chrome, padding, and elevation rely on the shared design tokens.
      </div>
    </div>
  ),
};
