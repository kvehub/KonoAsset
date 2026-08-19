import { FC } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Tag, X } from 'lucide-react'
import { useLocalization } from '@/hooks/use-localization'

type Props = {
  activeTag: string | null
  popoverOpen: boolean
  setPopoverOpen: (open: boolean) => void
  inputValue: string
  setInputValue: (value: string) => void
  candidates: string[]
  onSelectTag: (tag: string) => void
  onExit: () => void
}

export const InternalQuickTagModeButton: FC<Props> = ({
  activeTag,
  popoverOpen,
  setPopoverOpen,
  inputValue,
  setInputValue,
  candidates,
  onSelectTag,
  onExit,
}) => {
  const { t } = useLocalization()

  const trimmedInput = inputValue.trim()
  const showCreateItem =
    trimmedInput.length > 0 && !candidates.includes(trimmedInput)

  return (
    <div className="flex flex-row items-center gap-1">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          {activeTag === null ? (
            <Button
              variant="outline"
              className="text-muted-foreground"
              aria-label={t('quicktag:button:tooltip')}
              data-testid="quick-tag-mode-trigger"
            >
              <Tag className="size-6" />
            </Button>
          ) : (
            <Button variant="secondary" data-testid="quick-tag-mode-chip">
              <Tag className="size-6" />
              <span className="max-w-40 truncate">{activeTag}</span>
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="end">
          <Command>
            <CommandInput
              placeholder={t('quicktag:popover:placeholder')}
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>{t('quicktag:popover:empty')}</CommandEmpty>
              <CommandGroup>
                {candidates.map((tag) => (
                  <CommandItem
                    key={tag}
                    value={tag}
                    onSelect={() => onSelectTag(tag)}
                  >
                    {tag}
                  </CommandItem>
                ))}
              </CommandGroup>
              {showCreateItem && (
                <CommandGroup>
                  <CommandItem
                    value={trimmedInput}
                    onSelect={() => onSelectTag(trimmedInput)}
                  >
                    {t('quicktag:popover:create')} {trimmedInput}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {activeTag !== null && (
        <Button
          variant="ghost"
          className="size-8"
          aria-label={t('quicktag:chip:exit')}
          onClick={onExit}
          data-testid="quick-tag-mode-exit"
        >
          <X />
        </Button>
      )}
    </div>
  )
}
