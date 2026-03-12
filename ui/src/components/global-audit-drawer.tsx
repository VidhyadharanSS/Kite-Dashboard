/**
 * GlobalAuditDrawer — Cluster-wide activity feed accessible from the site header.
 *
 * Shows recent resource changes made through Kite (powered by the existing /api/audit endpoint).
 * Filterable by operation type and namespace. Clicking any entry navigates to the resource.
 */
import { useMemo, useState } from 'react'
import {
    IconAlertCircle,
    IconCheck,
    IconClock,
    IconFilter,
    IconHistory,
    IconRefresh,
    IconX,
} from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'

import { useAuditLogs } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const RESOURCE_TO_ROUTE: Record<string, string> = {
    pods: 'pods',
    pod: 'pods',
    deployments: 'deployments',
    deployment: 'deployments',
    statefulsets: 'statefulsets',
    statefulset: 'statefulsets',
    daemonsets: 'daemonsets',
    daemonset: 'daemonsets',
    services: 'services',
    service: 'services',
    configmaps: 'configmaps',
    configmap: 'configmaps',
    secrets: 'secrets',
    secret: 'secrets',
    ingresses: 'ingresses',
    ingress: 'ingresses',
    persistentvolumeclaims: 'persistentvolumeclaims',
    pvc: 'persistentvolumeclaims',
    persistentvolumes: 'persistentvolumes',
    pv: 'persistentvolumes',
    cronjobs: 'cronjobs',
    cronjob: 'cronjobs',
    jobs: 'jobs',
    job: 'jobs',
    horizontalpodautoscalers: 'horizontalpodautoscalers',
    hpa: 'horizontalpodautoscalers',
}

function getResourceUrl(type: string, ns: string, name: string) {
    const route = RESOURCE_TO_ROUTE[type.toLowerCase()]
    if (!route) return null
    if (ns && ns !== '' && ns !== '_all') return `/${route}/${ns}/${name}`
    return `/${route}/_all/${name}`
}

const OP_COLORS: Record<string, string> = {
    create: 'bg-green-500/15 text-green-600 border-green-500/20',
    update: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
    patch: 'bg-sky-500/15 text-sky-600 border-sky-500/20',
    delete: 'bg-destructive/15 text-destructive border-destructive/20',
    apply: 'bg-violet-500/15 text-violet-600 border-violet-500/20',
}

export function GlobalAuditDrawer() {
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)
    const [opFilter, setOpFilter] = useState<string>('all')

    const { data, isLoading, refetch } = useAuditLogs(
        1, 50, undefined, undefined,
        opFilter === 'all' ? undefined : opFilter,
        undefined, undefined, undefined, undefined,
        { refetchInterval: isOpen ? 30000 : 0 }
    )

    const entries = useMemo(() => data?.data ?? [], [data])

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <IconHistory className="h-4 w-4" />
                                <span className="sr-only">Audit Log</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Recent Changes (Audit Log)</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </SheetTrigger>

            <SheetContent side="right" className="w-[480px] sm:w-[520px] flex flex-col gap-0 p-0">
                <SheetHeader className="px-4 py-3 border-b shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                            <IconHistory className="h-4 w-4" />
                            Audit Log
                            <span className="text-muted-foreground font-normal text-xs">
                                {data?.total ? `${data.total} total` : ''}
                            </span>
                        </SheetTitle>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => refetch()} disabled={isLoading}>
                            <IconRefresh className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </SheetHeader>

                {/* Operation type filter */}
                <div className="px-4 py-2 border-b shrink-0">
                    <div className="flex items-center gap-1 flex-wrap">
                        <IconFilter className="h-3 w-3 text-muted-foreground shrink-0" />
                        {(['all', 'create', 'update', 'patch', 'delete', 'apply'] as const).map(op => (
                            <button
                                key={op}
                                onClick={() => setOpFilter(op)}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${opFilter === op
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted text-muted-foreground hover:text-foreground border-transparent'
                                    }`}
                            >
                                {op === 'all' ? 'All' : op.charAt(0).toUpperCase() + op.slice(1)}
                            </button>
                        ))}
                        {opFilter !== 'all' && (
                            <button onClick={() => setOpFilter('all')} className="text-muted-foreground hover:text-foreground">
                                <IconX className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Entry list */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading && entries.length === 0 ? (
                        <div className="space-y-3 p-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />
                            ))}
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                            <IconHistory className="h-8 w-8 opacity-30" />
                            <p className="text-sm">No audit entries</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {entries.map((entry, idx) => {
                                const url = getResourceUrl(
                                    entry.resourceType ?? '',
                                    entry.namespace ?? '',
                                    entry.resourceName ?? ''
                                )
                                const opColor = OP_COLORS[entry.operationType?.toLowerCase() ?? ''] ?? OP_COLORS.update
                                const ago = entry.createdAt
                                    ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }).replace('about ', '')
                                    : ''

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => url && (navigate(url), setIsOpen(false))}
                                        className={`w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors group ${!url ? 'cursor-default' : ''}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 shrink-0">
                                                {entry.success
                                                    ? <IconCheck className="h-4 w-4 text-green-500" />
                                                    : <IconAlertCircle className="h-4 w-4 text-destructive" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${opColor}`}>
                                                        {entry.operationType?.toUpperCase() ?? 'OP'}
                                                    </span>
                                                    <span className="text-xs font-medium truncate">{entry.resourceType}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{ago}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-xs">
                                                    <span className="font-mono text-foreground/80 truncate">
                                                        {entry.namespace ? `${entry.namespace}/` : ''}{entry.resourceName}
                                                    </span>
                                                </div>
                                                {entry.operator && (
                                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                                        <IconClock className="h-2.5 w-2.5" />
                                                        <span>by {entry.operator.username}</span>
                                                        {entry.clusterName && <span>· {entry.clusterName}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 border-t text-xs text-muted-foreground shrink-0">
                    Showing {entries.length} of {data?.total ?? 0} entries · refreshes every 30s
                </div>
            </SheetContent>
        </Sheet>
    )
}
