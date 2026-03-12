import React from 'react'
import { cn } from '@/lib/utils'

interface FilterBarProps {
    children: React.ReactNode
    className?: string
}

export function FilterBar({ children, className }: FilterBarProps) {
    return (
        <div className={cn(
            "flex flex-wrap items-center gap-2 p-1.5 rounded-xl border",
            "bg-background/80 backdrop-blur-md shadow-sm transition-all duration-300",
            "border-slate-200 dark:border-slate-800",
            "group hover:shadow-md hover:border-blue-500/20",
            className
        )}>
            {children}
        </div>
    )
}

interface FilterGroupProps {
    children: React.ReactNode
    label?: string
    className?: string
}

export function FilterGroup({ children, label, className }: FilterGroupProps) {
    return (
        <div className={cn("flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/30", className)}>
            {label && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                    {label}
                </span>
            )}
            {children}
        </div>
    )
}
