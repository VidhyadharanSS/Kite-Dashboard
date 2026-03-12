import { useCallback, useMemo, useState } from 'react'
import {
    IconAlertTriangle,
    IconBell,
    IconChevronRight,
    IconFilter,
    IconInfoCircle,
    IconRefresh,
    IconX,
} from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'

import { useResources } from '@/lib/api'
import { usePermissions } from '@/hooks/use-permissions'
import { usePinnedNamespaces } from '@/hooks/use-pinned-namespaces'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const RESOURCE_TO_ROUTE: Record<string, string> = {
    Pod: 'pods',
    Deployment: 'deployments',
    StatefulSet: 'statefulsets',
    DaemonSet: 'daemonsets',
    Service: 'services',
    ConfigMap: 'configmaps',
    Node: 'nodes',
    Job: 'jobs',
    CronJob: 'cronjobs',
    ReplicaSet: 'replicasets',
}

function getResourceUrl(kind: string, ns: string | undefined, name: string) {
    const resourceType = RESOURCE_TO_ROUTE[kind]
    if (!resourceType) return null
    if (ns) return `/${resourceType}/${ns}/${name}`
    return `/${resourceType}/_all/${name}`
}

export function LiveEventDrawer() {
    const navigate = useNavigate()
    const { canAccess } = usePermissions()
    const { pinned } = usePinnedNamespaces()

    const [isOpen, setIsOpen] = useState(false)
    const [nsFilter, setNsFilter] = useState<string>('_all')
    const [typeFilter, setTypeFilter] = useState<'all' | 'Warning' | 'Normal'>('all')

    const { data, isLoading, refetch } = useResources('events', undefined, {
        refreshInterval: isOpen ? 15000 : 0,
        disable: !canAccess('events', 'list'),
    })

    const events = useMemo(() => {
        return (data ?? [])
            .filter((ev) => {
                if (!ev.involvedObject?.kind) return false
                if (nsFilter !== '_all' && ev.involvedObject?.namespace !== nsFilter) return false
                if (typeFilter !== 'all' && ev.type !== typeFilter) return false
                return true
            })
            .sort((a, b) => {
                const ta = new Date(a.lastTimestamp || a.metadata.creationTimestamp || '').getTime()
                const tb = new Date(b.lastTimestamp || b.metadata.creationTimestamp || '').getTime()
                return tb - ta
            })
            .slice(0, 60)
    }, [data, nsFilter, typeFilter])

    const warningCount = useMemo(() =>
        (data ?? []).filter(e => e.type === 'Warning').length,
        [data]
    )

    const handleEventClick = useCallback((ev: any) => {
        const url = getResourceUrl(
            ev.involvedObject?.kind,
            ev.involvedObject?.namespace,
            ev.involvedObject?.name
        )
        if (url) {
            navigate(url)
            setIsOpen(false)
        }
    }, [navigate])

    const namespacesToShow = useMemo(() => {
        const seen = new Set<string>()
            ; (data ?? []).forEach(e => {
                const ns = e.involvedObject?.namespace
                if (ns) seen.add(ns)
            })
        // pinned first, then sorted alphabetically
        return [
            ...pinned.filter(p => seen.has(p)),
            ...[...seen].filter(s => !pinned.includes(s)).sort(),
        ]
    }, [data, pinned])

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative h-8 w-8"
                            onClick={() => setIsOpen(true)}
                        >
                            <IconBell className="h-4 w-4" />
                            {warningCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground leading-none">
                                    {warningCount > 9 ? '9+' : warningCount}
                                </span>
                            )}
                            <span className="sr-only">Cluster Events</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        Live Cluster Events {warningCount > 0 ? `(${warningCount} warnings)` : ''}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <SheetContent side="right" className="w-[480px] sm:w-[520px] flex flex-col gap-0 p-0">
                <SheetHeader className="px-4 py-3 border-b shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                            <IconBell className="h-4 w-4" />
                            Live Cluster Events
                            {warningCount > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                    {warningCount} warnings
                                </Badge>
                            )}
                        </SheetTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => refetch()}
                            disabled={isLoading}
                        >
                            <IconRefresh className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </SheetHeader>

                {/* Filters */}
                <div className="px-4 py-2 border-b shrink-0 space-y-2">
                    {/* Event type filter */}
                    <div className="flex items-center gap-1">
                        <IconFilter className="h-3 w-3 text-muted-foreground shrink-0" />
                        {(['all', 'Warning', 'Normal'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t)}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${typeFilter === t
                                    ? t === 'Warning'
                                        ? 'bg-destructive text-destructive-foreground'
                                        : 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {t === 'all' ? 'All Types' : t}
                            </button>
                        ))}
                    </div>

                    {/* Namespace filter — pinned first */}
                    {namespacesToShow.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                            <button
                                onClick={() => setNsFilter('_all')}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${nsFilter === '_all'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                All NS
                            </button>
                            {namespacesToShow.slice(0, 8).map(ns => (
                                <button
                                    key={ns}
                                    onClick={() => setNsFilter(ns)}
                                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-0.5 ${nsFilter === ns
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {pinned.includes(ns) && <span className="text-[8px]">📌</span>}
                                    {ns}
                                </button>
                            ))}
                            {nsFilter !== '_all' && (
                                <button
                                    onClick={() => setNsFilter('_all')}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <IconX className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Event list */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading && events.length === 0 ? (
                        <div className="space-y-3 p-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
                            ))}
                        </div>
                    ) : events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                            <IconBell className="h-8 w-8 opacity-30" />
                            <p className="text-sm">No events</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {events.map((ev, idx) => {
                                const isWarning = ev.type === 'Warning'
                                const canNavigate = !!getResourceUrl(
                                    ev.involvedObject?.kind ?? '',
                                    ev.involvedObject?.namespace,
                                    ev.involvedObject?.name ?? ''
                                )
                                const ago = ev.lastTimestamp || ev.metadata.creationTimestamp
                                    ? formatDistanceToNow(
                                        new Date(ev.lastTimestamp || ev.metadata.creationTimestamp || ''),
                                        { addSuffix: true }
                                    ).replace('about ', '')
                                    : ''

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => canNavigate && handleEventClick(ev)}
                                        className={`w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors group ${!canNavigate ? 'cursor-default' : ''}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 shrink-0">
                                                {isWarning
                                                    ? <IconAlertTriangle className="h-4 w-4 text-amber-500" />
                                                    : <IconInfoCircle className="h-4 w-4 text-blue-500" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className={`text-xs font-semibold ${isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                                        {ev.reason}
                                                    </span>
                                                    {ev.count && ev.count > 1 && (
                                                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                                                            ×{ev.count}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{ago}</span>
                                                </div>
                                                <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                                                    {ev.message}
                                                </p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className="text-[10px] text-muted-foreground font-mono">
                                                        {ev.involvedObject?.kind}/{ev.involvedObject?.namespace && `${ev.involvedObject.namespace}/`}{ev.involvedObject?.name}
                                                    </span>
                                                    {canNavigate && (
                                                        <IconChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 border-t text-xs text-muted-foreground shrink-0">
                    Showing {events.length} events · refreshes every 15s while open
                </div>
            </SheetContent>
        </Sheet>
    )
}