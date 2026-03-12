import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
    IconHeartbeat,
    IconLoader2,
    IconAlertTriangle,
    IconAlertCircle,
    IconInfoCircle,
    IconCheck,
    IconShieldCheck,
} from '@tabler/icons-react'
import { useClusterHealth } from '@/lib/api'
import { usePermissions } from '@/hooks/use-permissions'

const GRADE_COLORS: Record<string, string> = {
    A: 'bg-emerald-500 text-white',
    B: 'bg-blue-500 text-white',
    C: 'bg-yellow-500 text-white',
    D: 'bg-orange-500 text-white',
    F: 'bg-red-500 text-white',
}

const GRADE_RING: Record<string, string> = {
    A: 'ring-emerald-500/30',
    B: 'ring-blue-500/30',
    C: 'ring-yellow-500/30',
    D: 'ring-orange-500/30',
    F: 'ring-red-500/30',
}

const SEVERITY_ICON: Record<string, typeof IconAlertCircle> = {
    critical: IconAlertCircle,
    warning: IconAlertTriangle,
    info: IconInfoCircle,
}

const SEVERITY_COLOR: Record<string, string> = {
    critical: 'text-red-500',
    warning: 'text-amber-500',
    info: 'text-blue-500',
}

export function ClusterHealthWidget() {
    const { canAccess } = usePermissions()
    const canListNodes = canAccess('nodes', 'list')
    const { data: health, isLoading, error } = useClusterHealth({
        enabled: canListNodes,
    })

    if (!canListNodes) return null

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                    <IconHeartbeat className="h-5 w-5" />
                    Cluster Health
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <IconLoader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        Failed to load health data
                    </div>
                ) : health ? (
                    <div className="space-y-4">
                        {/* Grade and Score */}
                        <div className="flex items-center gap-4">
                            <div className={`flex items-center justify-center h-16 w-16 rounded-full text-2xl font-bold ring-4 ${GRADE_COLORS[health.grade]} ${GRADE_RING[health.grade]}`}>
                                {health.grade}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold">{health.score}</span>
                                    <span className="text-sm text-muted-foreground">/100</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Overall health score
                                </p>
                            </div>
                        </div>

                        {/* Component Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                            <IconShieldCheck className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="text-sm font-medium">
                                                    {health.nodeHealth.healthy}/{health.nodeHealth.total}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">Nodes Ready</div>
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>Node health: {health.nodeHealth.score}%</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                            <IconCheck className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="text-sm font-medium">
                                                    {health.podHealth.healthy}/{health.podHealth.total}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">Pods Healthy</div>
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>Pod health: {health.podHealth.score}%</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        {/* Resource Pressure */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">CPU Requests</span>
                                <span className={`font-mono ${health.resourcePressure.cpuUsagePct > 80 ? 'text-amber-500' : ''}`}>
                                    {health.resourcePressure.cpuUsagePct.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${health.resourcePressure.cpuUsagePct > 90
                                        ? 'bg-red-500'
                                        : health.resourcePressure.cpuUsagePct > 70
                                            ? 'bg-amber-500'
                                            : 'bg-emerald-500'
                                        }`}
                                    style={{ width: `${Math.min(health.resourcePressure.cpuUsagePct, 100)}%` }}
                                />
                            </div>

                            <div className="flex items-center justify-between text-xs mt-2">
                                <span className="text-muted-foreground">Memory Requests</span>
                                <span className={`font-mono ${health.resourcePressure.memUsagePct > 80 ? 'text-amber-500' : ''}`}>
                                    {health.resourcePressure.memUsagePct.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${health.resourcePressure.memUsagePct > 90
                                        ? 'bg-red-500'
                                        : health.resourcePressure.memUsagePct > 70
                                            ? 'bg-amber-500'
                                            : 'bg-emerald-500'
                                        }`}
                                    style={{ width: `${Math.min(health.resourcePressure.memUsagePct, 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Warning Events */}
                        {health.warningEvents > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                                <IconAlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                <span className="text-muted-foreground">
                                    {health.warningEvents} warning event{health.warningEvents !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}

                        {/* Issues */}
                        {health.issues.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                    Issues ({health.issues.length})
                                </p>
                                {health.issues.slice(0, 4).map((issue, i) => {
                                    const Icon = SEVERITY_ICON[issue.severity] || IconInfoCircle
                                    const color = SEVERITY_COLOR[issue.severity] || 'text-muted-foreground'
                                    return (
                                        <div key={i} className="flex items-start gap-2 text-xs">
                                            <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} />
                                            <span className="text-foreground/80">{issue.message}</span>
                                        </div>
                                    )
                                })}
                                {health.issues.length > 4 && (
                                    <p className="text-[10px] text-muted-foreground">
                                        +{health.issues.length - 4} more issues
                                    </p>
                                )}
                            </div>
                        )}

                        {health.issues.length === 0 && (
                            <div className="flex items-center gap-2 text-xs text-emerald-600 pt-1 border-t">
                                <IconCheck className="h-3.5 w-3.5" />
                                <span>No issues detected</span>
                            </div>
                        )}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )
}
