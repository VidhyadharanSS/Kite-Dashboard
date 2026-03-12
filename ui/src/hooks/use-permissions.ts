import { useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useCluster } from '@/hooks/use-cluster'

export function usePermissions() {
    const { user } = useAuth()
    const { currentCluster } = useCluster()

    const match = useCallback((pattern: string, value: string): boolean => {
        if (pattern === '*') return true
        if (pattern === value) return true

        // Handle negation (e.g., "!secrets")
        if (pattern.startsWith('!')) {
            return pattern.substring(1) !== value
        }

        // Handle standard glob-style matching or simple regex if needed
        try {
            // Basic support for '*' as a wildcard in patterns like "pod*"
            const regexPattern = pattern.replace(/\*/g, '.*')
            const regex = new RegExp(`^${regexPattern}$`)
            return regex.test(value)
        } catch (e) {
            return false
        }
    }, [])

    const canAccess = useCallback(
        (resource: string, verb: string = 'list', namespace: string = '*'): boolean => {
            if (!user || !user.roles) return false
            if (!currentCluster) return false

            // Admin role has access to everything
            if (user.roles.some((role) => role.name === 'admin')) return true

            return user.roles.some((role) => {
                // Fallback to empty arrays if roles are not fully populated
                const roleClusters = role.clusters || []
                const roleNamespaces = role.namespaces || []
                const roleResources = role.resources || []
                const roleVerbs = role.verbs || []

                const clusterMatch = roleClusters.some((c) => match(c, currentCluster))
                const resourceMatch = roleResources.some((r) => match(r, resource))
                const verbMatch = roleVerbs.some((v) => match(v, verb))

                // If namespace is '*', it means "Does this user have ANY access to this resource/verb?"
                // for sidebar/discovery/global search purposes.
                const nsMatch =
                    namespace === '*'
                        ? roleNamespaces.length > 0
                        : roleNamespaces.some((ns) => match(ns, namespace))

                return clusterMatch && nsMatch && resourceMatch && verbMatch
            })
        },
        [user, currentCluster, match]
    )

    const canAccessNamespace = useCallback(
        (namespace: string): boolean => {
            if (!user || !user.roles) return false
            if (!currentCluster) return false

            // Admin role has access to everything
            if (user.roles.some((role) => role.name === 'admin')) return true

            return user.roles.some((role) => {
                const roleClusters = role.clusters || []
                const roleNamespaces = role.namespaces || []
                const clusterMatch = roleClusters.some((c) => match(c, currentCluster))
                const nsMatch = roleNamespaces.some((ns) => match(ns, namespace))
                return clusterMatch && nsMatch
            })
        },
        [user, currentCluster, match]
    )

    return { canAccess, canAccessNamespace }
}
