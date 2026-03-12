import { useMemo } from 'react'
import { IconAlertTriangle, IconInfoCircle, IconLoader } from '@tabler/icons-react'
import { Event } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { ResourceType } from '@/types/api'
import { useResourcesEvents } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { parseSchedulingMessage } from '@/lib/k8s-diagnostics'

import { Column, SimpleTable } from './simple-table'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'

export function EventTable(props: {
  resource: ResourceType
  name: string
  namespace?: string
}) {
  const { t } = useTranslation()
  const { data: events, isLoading } = useResourcesEvents(
    props.resource,
    props.name,
    props.namespace
  )

  // Smart Diagnostics
  const diagnostic = useMemo(() => {
    const schedulingEvent = events?.find(e => e.reason === 'FailedScheduling')
    if (schedulingEvent?.message) {
      return parseSchedulingMessage(schedulingEvent.message)
    }
    return null
  }, [events])

  // Event table columns
  const eventColumns = useMemo(
    (): Column<Event>[] => [
      {
        header: t('events.type'),
        accessor: (event: Event) => event.type || '',
        cell: (value: unknown) => {
          const type = value as string
          const variant = type === 'Normal' ? 'default' : 'destructive'
          return <Badge variant={variant}>{type}</Badge>
        },
      },
      {
        header: t('events.reason'),
        accessor: (event: Event) => event.reason || '',
        cell: (value: unknown) => (
          <div className="font-medium">{value as string}</div>
        ),
      },
      {
        header: t('events.message'),
        accessor: (event: Event) => event.message || '',
        cell: (value: unknown) => (
          <div className="text-sm whitespace-pre-wrap">{value as string}</div>
        ),
      },
      {
        header: t('events.source'),
        accessor: (event: Event) => event.reportingComponent || event.source?.component || '',
        cell: (value: unknown) => {
          return (
            <span className="text-muted-foreground text-sm">
              {value as string}
            </span>
          )
        },
      },
      {
        header: t('events.count'),
        accessor: (event: Event) => event.count || 1,
        cell: (value: unknown) => (
          <span className="text-sm font-mono">{value as number}</span>
        ),
      },
      {
        header: t('events.lastSeen'),
        accessor: (event: Event) =>
          event.lastTimestamp || event.eventTime || '',
        cell: (value: unknown) => {
          return (
            <span className="text-muted-foreground text-sm">
              {formatDate(value as string)}
            </span>
          )
        },
      },
    ],
    [t]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {diagnostic && diagnostic.isSchedulingFailure && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-bold">Smart Diagnostic: Scheduling Failure</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p className="text-sm font-medium">{diagnostic.summary}</p>
            <ul className="list-disc list-inside text-xs space-y-1 ml-1">
              {diagnostic.details.map((detail, idx) => (
                <li key={idx}>{detail}</li>
              ))}
            </ul>
            <div className="flex items-center gap-2 mt-4 pt-2 border-t border-destructive/10">
              <IconInfoCircle className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground italic truncate">
                Raw: {diagnostic.rawMessage}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 py-4">
          <CardTitle className="text-base flex items-center gap-2">
            {t('events.title')}
            {events && <Badge variant="secondary" className="text-[10px]">{events.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SimpleTable
            data={events || []}
            columns={eventColumns}
            emptyMessage={t('events.noEventsFound')}
          />
        </CardContent>
      </Card>
    </div>
  )
}
