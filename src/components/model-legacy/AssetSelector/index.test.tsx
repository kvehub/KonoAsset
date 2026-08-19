import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AssetSelector } from '.'

const selectorState = vi.hoisted(() => ({
  open: false,
  addAndClose: vi.fn(),
}))

vi.mock('@/hooks/use-localization', () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}))

vi.mock('./hook', () => ({
  useAssetSelector: () => ({
    open: selectorState.open,
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    searchInput: '',
    onSearchInputChange: vi.fn(),
    inputRef: { current: null },
    popoverMaxHeight: 300,
    isMatchedToSearch: (id: string) => id !== 'ignored',
    addAndClose: selectorState.addAndClose,
  }),
}))

vi.mock('../SlimAssetDetail', () => ({
  SlimAssetDetail: ({
    asset,
    children,
  }: {
    asset: { id: string; name: string }
    children: React.ReactNode
  }) => (
    <div data-testid={`asset-item-${asset.id}`}>
      {asset.name}
      {children}
    </div>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

type ObserverInstance = {
  callback: IntersectionObserverCallback
  disconnect: ReturnType<typeof vi.fn>
  observe: ReturnType<typeof vi.fn>
}

const observers: ObserverInstance[] = []

describe('AssetSelector', () => {
  beforeEach(() => {
    selectorState.open = false
    selectorState.addAndClose.mockReset()
    observers.length = 0

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        callback: IntersectionObserverCallback
        disconnect = vi.fn()
        observe = vi.fn()

        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback
          observers.push(this)
        }
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const assets = [
    { id: 'first', name: 'First' },
    { id: 'ignored', name: 'Ignored' },
    { id: 'second', name: 'Second' },
  ] as never[]

  it('does not mount the asset list while closed', () => {
    render(
      <AssetSelector
        assets={assets}
        ignoredAssetIds={[]}
        onSelected={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('asset-item-first')).toBeNull()
    expect(observers).toHaveLength(0)
  })

  it('lazy mounts visible items and unmounts the list when closed', () => {
    selectorState.open = true
    const view = render(
      <AssetSelector
        assets={assets}
        ignoredAssetIds={['ignored']}
        onSelected={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('asset-item-first')).toBeNull()
    expect(screen.queryByTestId('asset-item-ignored')).toBeNull()
    expect(observers).toHaveLength(2)

    act(() => {
      observers[0].callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(screen.getByTestId('asset-item-first')).not.toBeNull()
    expect(observers[0].disconnect).toHaveBeenCalled()

    selectorState.open = false
    view.rerender(
      <AssetSelector
        assets={assets}
        ignoredAssetIds={['ignored']}
        onSelected={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('asset-item-first')).toBeNull()
    expect(screen.queryByTestId('asset-item-second')).toBeNull()
  })

  it('adds an asset through the existing action', () => {
    selectorState.open = true
    render(
      <AssetSelector
        assets={assets}
        ignoredAssetIds={[]}
        onSelected={vi.fn()}
      />,
    )

    act(() => {
      observers[0].callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    fireEvent.click(screen.getByRole('button'))

    expect(selectorState.addAndClose).toHaveBeenCalledWith('first')
  })
})
