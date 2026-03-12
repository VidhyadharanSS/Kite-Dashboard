import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    IconHistory,
    IconLoader2,
    IconCheck,
    IconX,
    IconUser,
    IconActivity,
} from '@tabler/icons-react'
import { useAuditLogStats } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'

const OP_COLORS: Record<string, string> = {
    create: 'bg-green-500',
    update: 'bg-blue-500',
    patch: 'bg-sky-500',
    delete: 'bg-red-500',
    apply: 'bg-violet-500',
    restart: 'bg-amber-500',
}

export function AuditStatsWidget() {
    const { user } = useAuth()
    const isAdmin = user?.isAdmin?.() ?? false

    const { data: stats, isLoading } = useAuditLogStats(7, { enabled: isAdmin })

    if (!isAdmin) return null

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                    <IconActivity className="h-5 w-5" />
                    Activity Overview (7 days)
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                        <IconLoader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : !stats ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        No data available
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Summary stats */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="text-center p-2 rounded-md bg-muted/50">
                                <div className="text-2xl font-bold">{stats.totalActions}</div>
                                <div className="text-[10px] text-muted-foreground">Total Actions</div>
                            </div>
                            <div className="text-center p-2 rounded-md bg-emerald-500/10">
                                <div className="text-2xl font-bold text-emerald-600">{stats.successCount}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    <IconCheck className="h-3 w-3 inline" /> Success
                                </div>
                            </div>
                            <div className="text-center p-2 rounded-md bg-red-500/10">
                                <div className="text-2xl font-bold text-red-600">{stats.failureCount}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    <IconX className="h-3 w-3 inline" /> Failed
                                </div>
                            </div>
                        </div>

                        {/* Operation breakdown */}
                        {Object.keys(stats.operationCounts).length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                    Operations
                                </p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {Object.entries(stats.operationCounts).map(([op, count]) => (
                                        <div
                                            key={op}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50"
                                        >
                                            <div className={`h-2 w-2 rounded-full ${OP_COLORS[op] || 'bg-gray-500'}`} />
                                            <span className="text-xs font-medium capitalize">{op}</span>
                                            <span className="text-xs text-muted-foreground font-mono">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Top operators */}
                        {stats.topOperators && stats.topOperators.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                    Most Active Users
                                </p>
                                <div className="space-y-1.5">
                                    {stats.topOperators.slice(0, 3).map((op, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <IconUser className="h-3 w-3 text-muted-foreground" />
                                                <span className="font-medium">{op.username}</span>
                                            </div>
                                            <span className="text-muted-foreground font-mono">{op.count} actions</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity sparkline (simple bar chart) */}
                        {stats.recentActivity && stats.recentActivity.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                    Daily Activity
                                </p>
                                <div className="flex items-end gap-1 h-12">
                                    {(() => {
                                        const max = Math.max(...stats.recentActivity.map(d => d.count), 1)
                                        return stats.recentActivity.map((day, i) => {
                                            const height = Math.max((day.count / max) * 100, 4)
                                            return (
                                                <div
                                                    key={i}
                                                    className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-sm transition-colors relative group"
                                                    style={{ height: `${height}%` }}
                                                    title={`${day.date}: ${day.count} actions`}
                                                >
                                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block text-[9px] bg-popover border rounded px-1 py-0.5 whitespace-nowrap z-10">
                                                        {day.count}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                                <div className="flex justify-between text-[9px] text-muted-foreground">
                                    <span>{stats.recentActivity[0]?.date.slice(5)}</span>
                                    <span>{stats.recentActivity[stats.recentActivity.length - 1]?.date.slice(5)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
