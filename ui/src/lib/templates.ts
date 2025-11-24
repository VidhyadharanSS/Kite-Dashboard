// Kubernetes resource templates

export interface ValidationRule {
  pattern: RegExp
  message: string
}

export interface ResourceTemplate {
  name: string
  description: string
  yaml: string
  validationRules?: ValidationRule[]
}

// --- Strict Validation Rules ---

const standardWorkloadRules: ValidationRule[] = [
  // Security Context Rules
  {
    pattern: /runAsUser:\s*1000/,
    message: "Security Policy: 'runAsUser: 1000' is mandatory and cannot be changed."
  },
  {
    pattern: /runAsNonRoot:\s*true/,
    message: "Security Policy: 'runAsNonRoot: true' is mandatory."
  },
  {
    pattern: /readOnlyRootFilesystem:\s*true/,
    message: "Security Policy: 'readOnlyRootFilesystem: true' is mandatory."
  },
  {
    pattern: /drop:\s*\n\s*-\s*ALL/,
    message: "Security Policy: Capabilities must drop 'ALL'."
  },
  // Resource Rules
  {
    pattern: /requests:\s*\n\s*memory:\s*"?10Mi"?/,
    message: "Resource Policy: Memory requests must be defined (min 10Mi)."
  },
  {
    pattern: /limits:\s*\n\s*memory:\s*"?20Mi"?/,
    message: "Resource Policy: Memory limits must be defined."
  }
]

const probeRules: ValidationRule[] = [
  {
    pattern: /livenessProbe:/,
    message: "Availability Policy: livenessProbe is required."
  },
  {
    pattern: /readinessProbe:/,
    message: "Availability Policy: readinessProbe is required."
  }
]

// --- Templates ---

export const resourceTemplates: ResourceTemplate[] = [
  {
    name: 'Pod',
    description: 'A secure Pod with resources and probes',
    validationRules: [...standardWorkloadRules, ...probeRules],
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: example-pod
  namespace: default
  labels:
    app: example
    version: v1
  annotations:
    description: "Standard secure pod"
spec:
  restartPolicy: Always
  terminationGracePeriodSeconds: 30
  dnsPolicy: ClusterFirst
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: ""
    imagePullPolicy: IfNotPresent
    ports:
    - name: http
      containerPort: 80
      protocol: TCP
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
          - ALL
      readOnlyRootFilesystem: true
    resources:
      requests:
        memory: "10Mi"
        cpu: "10m"
      limits:
        memory: "20Mi"
        cpu: "20m"
    livenessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 3
      periodSeconds: 3
    readinessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 3
      periodSeconds: 3`,
  },
  {
    name: 'Deployment',
    description: 'A secure Deployment with strategies and probes',
    validationRules: [...standardWorkloadRules, ...probeRules],
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: example-deployment
  namespace: default
  labels:
    app: example
spec:
  replicas: 3
  revisionHistoryLimit: 10
  progressDeadlineSeconds: 600
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 25%
      maxSurge: 25%
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsUser: 1000
        runAsGroup: 3000
        fsGroup: 2000
        runAsNonRoot: true
      containers:
      - name: app
        image: ""
        imagePullPolicy: Always
        ports:
        - containerPort: 80
          protocol: TCP
        env:
        - name: ENVIRONMENT
          value: "production"
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
          readOnlyRootFilesystem: true
        resources:
          requests:
            memory: "10Mi"
            cpu: "10m"
          limits:
            memory: "20Mi"
            cpu: "20m"
        livenessProbe:
          tcpSocket:
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          tcpSocket:
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10`,
  },
  {
    name: 'StatefulSet',
    description: 'A secure StatefulSet with persistent storage',
    validationRules: standardWorkloadRules,
    yaml: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: example-statefulset
  namespace: default
spec:
  serviceName: "example-service"
  replicas: 3
  podManagementPolicy: OrderedReady
  updateStrategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      terminationGracePeriodSeconds: 10
      securityContext:
        runAsUser: 1000
        runAsGroup: 3000
        fsGroup: 2000
        runAsNonRoot: true
      containers:
      - name: app
        image: ""
        ports:
        - containerPort: 80
        volumeMounts:
        - name: data
          mountPath: /data
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
          readOnlyRootFilesystem: true
        resources:
          requests:
            memory: "10Mi"
            cpu: "10m"
          limits:
            memory: "20Mi"
            cpu: "20m"
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: standard
      resources:
        requests:
          storage: 1Gi`,
  },
  {
    name: 'Job',
    description: 'A secure Job task',
    validationRules: standardWorkloadRules,
    yaml: `apiVersion: batch/v1
kind: Job
metadata:
  name: example-job
  namespace: default
spec:
  completions: 1
  parallelism: 1
  backoffLimit: 4
  activeDeadlineSeconds: 100
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsUser: 1000
        runAsNonRoot: true
      containers:
      - name: task
        image: ""
        imagePullPolicy: IfNotPresent
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
          readOnlyRootFilesystem: true
        resources:
          requests:
            memory: "10Mi"
            cpu: "10m"
          limits:
            memory: "20Mi"
            cpu: "20m"`,
  },
  {
    name: 'CronJob',
    description: 'A secure scheduled CronJob',
    validationRules: standardWorkloadRules,
    yaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: example-cronjob
  namespace: default
spec:
  schedule: "0 2 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  startingDeadlineSeconds: 200
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          securityContext:
            runAsUser: 1000
            runAsNonRoot: true
          containers:
          - name: task
            image: ""
            securityContext:
              allowPrivilegeEscalation: false
              capabilities:
                drop:
                  - ALL
              readOnlyRootFilesystem: true
            resources:
              requests:
                memory: "10Mi"
                cpu: "10m"
              limits:
                memory: "20Mi"
                cpu: "20m"`,
  },
  {
    name: 'Service',
    description: 'A Service with session affinity',
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: example-service
  namespace: default
  labels:
    app: example
spec:
  selector:
    app: example
  type: ClusterIP
  sessionAffinity: None
  ports:
  - name: http
    port: 80
    targetPort: 80
    protocol: TCP`,
  },
  {
    name: 'ConfigMap',
    description: 'A ConfigMap',
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: example-configmap
  namespace: default
  labels:
    app: example
data:
  config.yaml: |
    server:
      port: 8080
    logging:
      level: info`,
  },
  {
    name: 'Daemonset',
    description: 'A secure DaemonSet',
    validationRules: standardWorkloadRules,
    yaml: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: example-daemonset
  namespace: default
  labels:
    app: example
spec:
  revisionHistoryLimit: 10
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      securityContext:
        runAsUser: 1000
        runAsNonRoot: true
      containers:
        - name: agent
          image: ""
          imagePullPolicy: Always
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
            readOnlyRootFilesystem: true
          resources:
            requests:
              memory: "10Mi"
              cpu: "10m"
            limits:
              memory: "20Mi"
              cpu: "20m"`,
  },
  {
    name: 'Ingress',
    description: 'An Ingress with standard annotations',
    yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: example-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - example.com
    secretName: example-tls
  rules:
    - host: example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: example-service
                port:
                  number: 80`,
  },
  {
    name: 'Namespace',
    description: 'Namespace with ResourceQuota',
    validationRules: [
      { pattern: /kind: ResourceQuota/, message: "Policy: Namespace must have a ResourceQuota defined." },
      { pattern: /limits.cpu/, message: "Policy: ResourceQuota must define limits.cpu." },
      { pattern: /limits.memory/, message: "Policy: ResourceQuota must define limits.memory." }
    ],
    yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: example-namespace
  labels:
    environment: dev
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: ns-quota
  namespace: example-namespace
spec:
  hard:
    requests.cpu: "1"
    requests.memory: 1Gi
    limits.cpu: "2"
    limits.memory: 2Gi
    pods: "10"`,
  },
]

export const getTemplateByName = (
  name: string
): ResourceTemplate | undefined => {
  return resourceTemplates.find((template) => template.name === name)
}

export const getTemplateNames = (): string[] => {
  return resourceTemplates.map((template) => template.name)
}