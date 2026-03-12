import { useMemo, useState } from 'react'
import { Event } from 'kubernetes-types/core/v1'
import { AlertTriangle, Info, Clock, Box, Shield, Search } from 'lucide-react'

import { useResources } from '@/lib/api'
import { formatDate, getAge } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ClusterEventsPage() {
    const { data: events, isLoading, refetch } = useResources('events', '_all')
    const [searchQuery, setSearchQuery] = useState('')
    const [typeFilter, setTypeFilter] = useState<'All' | 'Normal' | 'Warning'>('All')

    const filteredEvents = useMemo(() => {
        if (!events) return []
        return events
            .filter((event: Event) => {
                const matchesSearch =
                    event.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    event.involvedObject?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    event.reason?.toLowerCase().includes(searchQuery.toLowerCase())

                const matchesType = typeFilter === 'All' || event.type === typeFilter

                return matchesSearch && matchesType
            })
            .sort((a: Event, b: Event) => {
                const timeA = new Date(a.lastTimestamp || a.eventTime || 0).getTime()
                const timeB = new Date(b.lastTimestamp || b.eventTime || 0).getTime()
                return timeB - timeA
            })
    }, [events, searchQuery, typeFilter])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Cluster Events</h1>
                <p className="text-muted-foreground">Monitor activities and issues across all namespaces.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search events, resources, or reasons..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-muted/40 border-none h-10"
                    />
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-lg h-10">
                    <Button
                        variant={typeFilter === 'All' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTypeFilter('All')}
                        className="h-8 text-xs font-medium"
                    >
                        All
                    </Button>
                    <Button
                        variant={typeFilter === 'Normal' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTypeFilter('Normal')}
                        className="h-8 text-xs font-medium text-green-600 dark:text-green-400"
                    >
                        Normal
                    </Button>
                    <Button
                        variant={typeFilter === 'Warning' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTypeFilter('Warning')}
                        className="h-8 text-xs font-medium text-amber-600 dark:text-amber-400"
                    >
                        Warning
                    </Button>
                </div>

                <Button variant="outline" size="icon" onClick={() => refetch()} className="h-10 w-10">
                    <Clock className="h-4 w-4" />
                </Button>
            </div>

            <Card className="border-none bg-background/50 shadow-none">
                <CardContent className="p-0">
                    <div className="h-[calc(100vh-280px)] overflow-auto rounded-md">
                        <div className="space-y-1 p-1">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    <p className="text-sm text-muted-foreground italic font-medium">Crunching cluster events data...</p>
                                </div>
                            ) : filteredEvents.length === 0 ? (
                                <div className="text-center py-20">
                                    <Box className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
                                    <p className="text-muted-foreground">No events found matching your criteria.</p>
                                </div>
                            ) : (
                                filteredEvents.map((event: Event, idx) => (
                                    <EventListItem key={event.metadata?.uid || idx} event={event} />
                                ))
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function EventListItem({ event }: { event: Event }) {
    const isWarning = event.type === 'Warning'

    return (
        <div className={`group flex gap-4 p-4 rounded-xl transition-all hover:bg-muted/30 border-l-[3px] ${isWarning ? 'border-amber-500 bg-amber-500/5' : 'border-blue-500 bg-blue-500/5'}`}>
            <div className="mt-1 shrink-0">
                {isWarning ? (
                    <div className="p-2 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                ) : (
                    <div className="p-2 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        <Info className="h-5 w-5" />
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-bold tracking-tight uppercase ${isWarning ? 'text-amber-600' : 'text-blue-600'}`}>
                            {event.reason}
                        </span>
                        <div className="h-1 w-1 rounded-full bg-muted-foreground/30 mr-1" />
                        <span className="text-xs font-bold text-muted-foreground truncate uppercase opacity-60">
                            {event.involvedObject?.kind}: {event.involvedObject?.name}
                        </span>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-opacity hover:opacity-100 opacity-60">
                                <Clock className="h-3 w-3" />
                                <span>{getAge(event.lastTimestamp || event.eventTime || '')}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {formatDate(event.lastTimestamp || event.eventTime || '', true)}
                        </TooltipContent>
                    </Tooltip>
                </div>

                <p className="text-sm leading-relaxed text-foreground/90 font-medium">
                    {event.message}
                </p>

                <div className="flex items-center gap-3 pt-1">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        <Shield className="h-3 w-3" />
                        <span>{event.source?.component || event.reportingComponent || 'System'}</span>
                    </div>
                    <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        <Box className="h-3 w-3" />
                        <span>{event.involvedObject?.namespace || 'Global'}</span>
                    </div>
                    {event.count && event.count > 1 && (
                        <>
                            <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                            <Badge variant="secondary" className="text-[10px] h-4 font-bold border-none bg-muted px-1.5 text-muted-foreground">
                                Repeated {event.count}x
                            </Badge>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
