import { Pencil } from 'lucide-react'
import { FC } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLocalization } from '@/hooks/use-localization'

export type EntryListItem = { name: string; usageCount: number }

type Props = {
  title: string
  entries: EntryListItem[]
  totalCount: number
  countLabel: string
  isLoading: boolean
  filterText: string
  onRename: (name: string) => void
}

export const EntryList: FC<Props> = ({
  title, entries, totalCount, countLabel, isLoading, filterText, onRename,
}) => {
  const { t } = useLocalization()
  const filteredEntries = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(filterText.trim().toLocaleLowerCase()),
  )

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {totalCount} {countLabel}
        </span>
      </div>
      <div className="mt-3 min-h-0 flex-1 rounded-md border">
        <ScrollArea className="h-full">
          <div className="divide-y">
            {isLoading && (
              <p className="p-4 text-sm text-muted-foreground">
                {t('preference:settings:tag-management:loading')}
              </p>
            )}
            {!isLoading && entries.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {t('preference:settings:tag-management:empty')}
              </p>
            )}
            {!isLoading && entries.length > 0 && filteredEntries.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {t('preference:settings:tag-management:no-filter-results')}
              </p>
            )}
            {!isLoading && filteredEntries.map((entry) => (
              <div key={entry.name} className="flex items-center gap-4 px-4 py-3 odd:bg-muted/40">
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="w-20 text-right text-sm text-muted-foreground">
                  {entry.usageCount} {t('preference:settings:tag-management:usage-count')}
                </span>
                <Button variant="outline" size="sm" onClick={() => onRename(entry.name)}>
                  <Pencil />
                  {t('preference:settings:tag-management:rename')}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </section>
  )
}
