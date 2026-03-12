/**
 * Intelligent diagnostic utility for parsing cryptic Kubernetes scheduler events.
 * Focused on FailedScheduling messages to provide clear root-cause analysis.
 */

export interface SchedulingDiagnostic {
    isSchedulingFailure: boolean;
    rawMessage: string;
    summary: string;
    details: string[];
    severity: 'warning' | 'error' | 'info';
    category: 'Resource' | 'Taint' | 'Affinity' | 'Topology' | 'Unknown';
}

/**
 * Parses a FailedScheduling message from the Kubernetes scheduler.
 * Example input: "0/2 nodes are available: 2 node(s) had taints that the pod didn't tolerate."
 * Example input: "0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/master: }, 2 Insufficient cpu."
 */
export function parseSchedulingMessage(message: string): SchedulingDiagnostic {
    const diagnostic: SchedulingDiagnostic = {
        isSchedulingFailure: message.includes('nodes are available'),
        rawMessage: message,
        summary: 'Scheduler failed to find a suitable node.',
        details: [],
        severity: 'error',
        category: 'Unknown',
    };

    if (!diagnostic.isSchedulingFailure) {
        return diagnostic;
    }

    // Extract node counts
    const nodeMatch = message.match(/(\d+)\/(\d+) nodes are available/);
    if (nodeMatch) {
        const available = parseInt(nodeMatch[1], 10);
        const total = parseInt(nodeMatch[2], 10);
        diagnostic.summary = `${available} out of ${total} nodes were available for scheduling.`;
    }

    // Split reasons
    // Usually follows "available: "
    const reasonPart = message.split('available:')[1];
    if (reasonPart) {
        const reasons = reasonPart.split(',').map(r => r.trim());

        reasons.forEach(reason => {
            // 1. Taints
            if (reason.toLowerCase().includes('taint')) {
                diagnostic.category = 'Taint';
                diagnostic.details.push(`Taint Conflict: One or more nodes have taints (e.g., master-only or specialized hardware) that this pod does not tolerate.`);
            }

            // 2. Resources (CPU/Mem/GPU)
            if (reason.toLowerCase().includes('insufficient')) {
                diagnostic.category = 'Resource';
                if (reason.toLowerCase().includes('cpu')) {
                    diagnostic.details.push('Insufficient CPU: Requested CPU exceeds available capacity on all nodes.');
                }
                if (reason.toLowerCase().includes('memory')) {
                    diagnostic.details.push('Insufficient Memory: Requested memory exceeds available capacity on all nodes.');
                }
                if (reason.toLowerCase().includes('gpu') || reason.toLowerCase().includes('nvidia')) {
                    diagnostic.details.push('Insufficient GPU: Requested GPU resources are not available or fully allocated.');
                }
            }

            // 3. Affinity / Anti-affinity
            if (reason.toLowerCase().includes('affinity')) {
                diagnostic.category = 'Affinity';
                diagnostic.details.push('Affinity Conflict: Pod affinity/anti-affinity rules cannot be satisfied by current node/pod distribution.');
            }

            // 4. Selector
            if (reason.toLowerCase().includes('selector')) {
                diagnostic.category = 'Topology';
                diagnostic.details.push('Node Selector Mismatch: The pod\'s nodeSelector doesn\'t match labels on any available node.');
            }

            // 5. Port conflict
            if (reason.toLowerCase().includes('port')) {
                diagnostic.category = 'Topology';
                diagnostic.details.push('HostPort Conflict: The requested HostPort is already in use on available nodes.');
            }
        });
    }

    // Deduplicate and cleanup
    diagnostic.details = Array.from(new Set(diagnostic.details));

    if (diagnostic.details.length === 0) {
        diagnostic.details.push('The scheduler reported a general constraint violation. See raw message for details.');
    }

    return diagnostic;
}
