import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboardList,
  IconDownload,
  IconFilter,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { apiClient } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface AuditLogEntry {
  id: number
  level: string
  cluster: string
  username: string
  action: string
  resource: string
  namespace: string
  status: number
  method: string
  path: string
  createdAt: string
}

interface AuditLogResponse {
  data: AuditLogEntry[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

interface AuditLogStats {
  totalEntries: number
  todayEntries: number
  levelCounts: Record<string, number>
  topUsers: { username: string; count: number }[]
  topResources: { resource: string; count: number }[]
}

export function AuditLogPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<AuditLogResponse | null>(null)
  const [stats, setStats] = useState<AuditLogStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)

  // Filters
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [usernameFilter, setUsernameFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (levelFilter && levelFilter !== 'all') params.append('level', levelFilter)
      if (usernameFilter) params.append('username', usernameFilter)
      if (actionFilter) params.append('action', actionFilter)
      if (resourceFilter) params.append('resource', resourceFilter)

      const result = await apiClient.get<AuditLogResponse>(
        `/admin/audit-logs/?${params.toString()}`
      )
      setData(result)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
      toast.error('Failed to load audit logs')
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, levelFilter, usernameFilter, actionFilter, resourceFilter])

  const fetchStats = useCallback(async () => {
    try {
      const result = await apiClient.get<AuditLogStats>(
        `/admin/audit-logs/stats`
      )
      setStats(result)
    } catch (error) {
      console.error('Failed to fetch audit stats:', error)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handlePurge = async () => {
    if (!confirm('Are you sure you want to purge audit logs older than 90 days?')) return
    try {
      await apiClient.delete('/admin/audit-logs/purge?days=90')
      toast.success('Audit logs purged successfully')
      fetchLogs()
      fetchStats()
    } catch {
      toast.error('Failed to purge audit logs')
    }
  }

  const handleExportCSV = () => {
    if (!data?.data?.length) return
    const headers = ['Time', 'Level', 'User', 'Cluster', 'Action', 'Resource', 'Status', 'Method', 'Path']
    const rows = data.data.map((entry) => [
      new Date(entry.createdAt).toISOString(),
      entry.level,
      entry.username,
      entry.cluster,
      entry.action,
      entry.resource,
      String(entry.status),
      entry.method,
      entry.path,
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Audit logs exported')
  }

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return <Badge variant="destructive" className="text-xs"><IconX className="size-3 mr-1" />{level}</Badge>
      case 'WARN':
        return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><IconAlertTriangle className="size-3 mr-1" />{level}</Badge>
      default:
        return <Badge variant="outline" className="text-xs"><IconCheck className="size-3 mr-1" />{level}</Badge>
    }
  }

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      POST: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      PUT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      PATCH: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    }
    return (
      <Badge variant="outline" className={`text-xs font-mono ${colors[method] || ''}`}>
        {method}
      </Badge>
    )
  }

  const resetFilters = () => {
    setLevelFilter('')
    setUsernameFilter('')
    setActionFilter('')
    setResourceFilter('')
    setPage(1)
  }

  const hasFilters = levelFilter || usernameFilter || actionFilter || resourceFilter

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <IconClipboardList className="size-7" />
            {t('auditLog.title', 'Audit Log')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('auditLog.description', 'Track all user activities and system events across clusters')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data?.data?.length}>
            <IconDownload className="size-4 mr-1" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePurge}>
            <IconTrash className="size-4 mr-1" />
            Purge Old
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchStats(); }}>
            <IconRefresh className="size-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Entries</CardDescription>
              <CardTitle className="text-2xl">{stats.totalEntries.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Today</CardDescription>
              <CardTitle className="text-2xl">{stats.todayEntries.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Warnings</CardDescription>
              <CardTitle className="text-2xl text-yellow-600">{(stats.levelCounts['WARN'] || 0).toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Errors</CardDescription>
              <CardTitle className="text-2xl text-red-600">{(stats.levelCounts['ERROR'] || 0).toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <IconFilter className="size-4" />
              Filters
            </CardTitle>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All Levels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by username..."
              value={usernameFilter}
              onChange={(e) => { setUsernameFilter(e.target.value); setPage(1); }}
            />
            <Input
              placeholder="Filter by action..."
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            />
            <Input
              placeholder="Filter by resource..."
              value={resourceFilter}
              onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Time</TableHead>
                  <TableHead className="w-[80px]">Level</TableHead>
                  <TableHead className="w-[70px]">Method</TableHead>
                  <TableHead className="w-[120px]">User</TableHead>
                  <TableHead className="w-[100px]">Cluster</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="w-[100px]">Resource</TableHead>
                  <TableHead className="w-[70px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data?.data?.length ? (
                  data.data.map((entry) => (
                    <TableRow key={entry.id} className="group">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <span title={new Date(entry.createdAt).toLocaleString()}>
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>{getLevelBadge(entry.level)}</TableCell>
                      <TableCell>{entry.method ? getMethodBadge(entry.method) : '-'}</TableCell>
                      <TableCell className="font-medium text-sm">{entry.username}</TableCell>
                      <TableCell className="text-sm">{entry.cluster !== '-' ? entry.cluster : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={entry.action}>
                        {entry.action}
                      </TableCell>
                      <TableCell>
                        {entry.resource ? (
                          <Badge variant="outline" className="text-xs">{entry.resource}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-mono ${
                          entry.status >= 500 ? 'text-red-600' :
                          entry.status >= 400 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {entry.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No audit log entries found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, Number(data.pagination.total))} of {data.pagination.total} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.pagination.hasPrevPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
