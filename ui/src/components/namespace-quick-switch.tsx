/**
 * NamespaceQuickSwitch — Pinned namespaces shown as quick-access pills in the header.
 *
 * When a namespace pill is clicked it:
 * 1. Sets the global active namespace context (sessionStorage)
 * 2. Writes it to localStorage under the cluster key (so ResourceTable picks it up on next mount)
 * 3. Dispatches a storage event so any currently-mounted ResourceTable reacts immediately
 *
 * Appears in site-header.tsx between the breadcrumb and the search bar.
 */
import { useCallback, useMemo } from 'react'
import { IconPin, IconX } from '@tabler/icons-react'
import { Namespace } from 'kubernetes-types/core/v1'

import { useResources } from '@/lib/api'
import { useNamespaceContext } from '@/hooks/use-namespace-context'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Propagate the chosen namespace to ResourceTable's localStorage key. */
function syncNamespaceToResourceTable(ns: string) {
    try {
        const clusterKey = (localStorage.getItem('current-cluster') ?? '') + 'selectedNamespace'
        const value = ns === '_all' ? '_all' : ns
        localStorage.setItem(clusterKey, value)
        // ResourceTable watches for storage events — trigger one so it picks up the change
        window.dispatchEvent(new StorageEvent('storage', { key: clusterKey, newValue: value }))
    } catch { /* ignore */ }
}

export function NamespaceQuickSwitch() {
    const { activeNamespace, setActiveNamespace, pinned, togglePin } = useNamespaceContext()
    const { data } = useResources('namespaces', undefined, { refreshInterval: 0 })

    const pinnedOptions = useMemo(() => {
        const available = new Set(
            (data as Namespace[] | undefined)
                ?.map(ns => ns.metadata?.name ?? '')
                .filter(Boolean) ?? []
        )
        return pinned.filter(p => available.has(p))
    }, [pinned, data])

    const handleSelect = useCallback((ns: string) => {
        setActiveNamespace(ns)
        syncNamespaceToResourceTable(ns)
    }, [setActiveNamespace])

    if (pinnedOptions.length === 0) return null

    return (
        <TooltipProvider>
            <div className="hidden md:flex items-center gap-1 mx-2">
                {/* Clear/reset pill — only shown when a specific NS is active */}
                {activeNamespace !== '_all' && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => handleSelect('_all')}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-colors"
                            >
                                <IconX className="h-2.5 w-2.5" />
                                Clear
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Clear namespace filter</TooltipContent>
                    </Tooltip>
                )}

                {pinnedOptions.map(ns => {
                    const isActive = activeNamespace === ns
                    return (
                        <Tooltip key={ns}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => handleSelect(isActive ? '_all' : ns)}
                                    className={`group flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${isActive
                                        ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                        }`}
                                >
                                    <span className="text-[8px] opacity-70">📌</span>
                                    <span className="max-w-[80px] truncate">{ns}</span>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="flex flex-col gap-1 p-2 text-left max-w-[180px]">
                                <p className="font-medium text-xs">{ns}</p>
                                <p className="text-current opacity-80 text-[10px]">
                                    {isActive ? 'Active — click to clear' : 'Click to filter all list pages to this namespace'}
                                </p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); togglePin(ns); if (isActive) handleSelect('_all') }}
                                    className="text-[10px] text-current opacity-80 hover:opacity-100 mt-1 flex items-center gap-1 underline underline-offset-2 transition-opacity"
                                >
                                    <IconPin className="h-2.5 w-2.5" />
                                    Unpin
                                </button>
                            </TooltipContent>
                        </Tooltip>
                    )
                })}
            </div>
        </TooltipProvider>
    )
}