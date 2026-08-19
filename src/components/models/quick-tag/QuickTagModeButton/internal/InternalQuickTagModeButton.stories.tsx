import type { Meta, StoryObj } from '@storybook/react-vite'
import { InternalQuickTagModeButton } from './InternalQuickTagModeButton'
import { fn } from 'storybook/test'

const meta = {
  title: 'quick-tag/QuickTagModeButton',
  component: InternalQuickTagModeButton,
  parameters: {
    layout: 'centered',
  },
  tags: [],
  args: {
    activeTag: null,
    popoverOpen: false,
    setPopoverOpen: fn(),
    inputValue: '',
    setInputValue: fn(),
    candidates: ['マヌカ導入済', '舞夜導入済', 'お気に入り'],
    onSelectTag: fn(),
    onExit: fn(),
  },
} satisfies Meta<typeof InternalQuickTagModeButton>

export default meta
type Story = StoryObj<typeof meta>

export const Inactive: Story = {}

export const PopoverOpen: Story = {
  args: {
    popoverOpen: true,
  },
}

export const Active: Story = {
  args: {
    activeTag: 'マヌカ導入済',
  },
}
