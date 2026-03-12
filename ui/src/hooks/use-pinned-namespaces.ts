import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'kite:pinned-namespaces'

function load(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        return JSON.parse(raw) as string[]
    } catch {
        return []
    }
}

function save(namespaces: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(namespaces))
}

export function usePinnedNamespaces() {
    const [pinned, setPinned] = useState<string[]>(load)

    useEffect(() => {
        save(pinned)
    }, [pinned])

    const pin = useCallback((ns: string) => {
        setPinned(prev => prev.includes(ns) ? prev : [ns, ...prev])
    }, [])

    const unpin = useCallback((ns: string) => {
        setPinned(prev => prev.filter(n => n !== ns))
    }, [])

    const toggle = useCallback((ns: string) => {
        setPinned(prev =>
            prev.includes(ns) ? prev.filter(n => n !== ns) : [ns, ...prev]
        )
    }, [])

    const isPinned = useCallback(
        (ns: string) => pinned.includes(ns),
        [pinned]
    )

    return { pinned, pin, unpin, toggle, isPinned }
}
