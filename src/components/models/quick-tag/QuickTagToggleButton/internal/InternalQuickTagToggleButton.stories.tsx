import type { Meta, StoryObj } from '@storybook/react-vite'
import { InternalQuickTagToggleButton } from './InternalQuickTagToggleButton'
import { fn } from 'storybook/test'

const meta = {
  title: 'quick-tag/QuickTagToggleButton',
  component: InternalQuickTagToggleButton,
  parameters: {
    layout: 'centered',
  },
  tags: [],
  args: {
    tagged: false,
    pending: false,
    onClick: fn(),
  },
} satisfies Meta<typeof InternalQuickTagToggleButton>

export default meta
type Story = StoryObj<typeof meta>

export const Untagged: Story = {}

export const Tagged: Story = {
  args: {
    tagged: true,
  },
}

export const Pending: Story = {
  args: {
    pending: true,
  },
}
