package utils

import (
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

// --- Configuration Constants ---
// These match your templates.ts requirements exactly
const (
	ExpectedRunAsUser   int64  = 1000
	ExpectedRunAsGroup  int64  = 3000
	ExpectedFsGroup     int64  = 2000
	ExpectedSeccompType string = "RuntimeDefault"
	ExpectedDropCap     string = "ALL"
	MinMemoryRequest    string = "10Mi" // Used for defaults, validation checks existence
	MinCpuRequest       string = "10m"  // Used for defaults, validation checks existence
)

var (
	// SensitivePaths blocked from hostPath mounting
	SensitivePaths = []string{
		"/", "/boot", "/proc", "/etc", "/var", "/sys", "/dev", "/usr", "/run",
	}

	// Default Security Contexts (for auto-injection/mutation if missing, though validation will catch it if explicit bad values exist)
	podSecurityContext = map[string]interface{}{
		"runAsUser":    ExpectedRunAsUser,
		"runAsGroup":   ExpectedRunAsGroup,
		"fsGroup":      ExpectedFsGroup,
		"runAsNonRoot": true,
		"seccompProfile": map[string]interface{}{
			"type": ExpectedSeccompType,
		},
	}

	containerSecurityContext = map[string]interface{}{
		"allowPrivilegeEscalation": false,
		"readOnlyRootFilesystem":   true,
		"capabilities": map[string]interface{}{
			"drop": []interface{}{ExpectedDropCap},
		},
	}

	defaultResources = map[string]interface{}{
		"requests": map[string]interface{}{
			"cpu":    MinCpuRequest,
			"memory": MinMemoryRequest,
		},
		"limits": map[string]interface{}{
			"cpu":    "20m",
			"memory": "20Mi",
		},
	}
)

// ValidateResourceSecurity performs strict validation based on your templates.ts rules.
func ValidateResourceSecurity(obj *unstructured.Unstructured) error {
	kind := obj.GetKind()
	var podSpecPath []string

	// 1. Determine path to PodSpec based on Kind
	switch kind {
	case "Pod":
		podSpecPath = []string{"spec"}
	case "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet":
		podSpecPath = []string{"spec", "template", "spec"}
	case "Job":
		podSpecPath = []string{"spec", "template", "spec"}
	case "CronJob":
		podSpecPath = []string{"spec", "jobTemplate", "spec", "template", "spec"}
	default:
		// Skip validation for non-workload resources (Services, ConfigMaps, etc.)
		return nil
	}

	// Access the PodSpec
	podSpec, found, _ := unstructured.NestedMap(obj.Object, podSpecPath...)
	if !found {
		return fmt.Errorf("invalid resource: could not find PodSpec")
	}

	// 2. Validate Host Paths (Sensitive Mounts)
	if err := validateVolumes(podSpec); err != nil {
		return err
	}

	// 3. Validate Pod-Level Security Context (User 1000, Group 3000, etc.)
	if err := validatePodSecurityContext(podSpec); err != nil {
		return err
	}

	// 4. Validate Containers (Security, Resources, Probes)
	// Jobs/CronJobs usually don't need Probes, so we skip probe validation for them
	requireProbes := kind != "Job" && kind != "CronJob"

	containers, _, _ := unstructured.NestedSlice(podSpec, "containers")
	for _, c := range containers {
		if err := validateContainer(c.(map[string]interface{}), false, requireProbes); err != nil {
			return err
		}
	}

	// 5. Validate InitContainers (Security, Resources - Probes not required)
	initContainers, _, _ := unstructured.NestedSlice(podSpec, "initContainers")
	for _, c := range initContainers {
		if err := validateContainer(c.(map[string]interface{}), true, false); err != nil {
			return err
		}
	}

	return nil
}

// validateVolumes checks for forbidden hostPath mounts
func validateVolumes(podSpec map[string]interface{}) error {
	volumes, found, _ := unstructured.NestedSlice(podSpec, "volumes")
	if !found {
		return nil
	}
	for _, v := range volumes {
		vol, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		if hostPath, found, _ := unstructured.NestedMap(vol, "hostPath"); found {
			if path, ok := hostPath["path"].(string); ok {
				cleanPath := strings.TrimSpace(path)
				for _, sensitive := range SensitivePaths {
					if cleanPath == sensitive || strings.HasPrefix(cleanPath, sensitive+"/") {
						return fmt.Errorf("security violation: mounting host path '%s' is restricted", cleanPath)
					}
				}
			}
		}
	}
	return nil
}

// validatePodSecurityContext enforces Rule: User 1000, Group 3000, FSGroup 2000, NonRoot, Seccomp
func validatePodSecurityContext(podSpec map[string]interface{}) error {
	sc, found, _ := unstructured.NestedMap(podSpec, "securityContext")
	if !found {
		return fmt.Errorf("security violation: pod securityContext is missing")
	}

	if val, found, _ := unstructured.NestedInt64(sc, "runAsUser"); !found || val != ExpectedRunAsUser {
		return fmt.Errorf("security violation: runAsUser must be %d", ExpectedRunAsUser)
	}
	if val, found, _ := unstructured.NestedInt64(sc, "runAsGroup"); !found || val != ExpectedRunAsGroup {
		return fmt.Errorf("security violation: runAsGroup must be %d", ExpectedRunAsGroup)
	}
	if val, found, _ := unstructured.NestedInt64(sc, "fsGroup"); !found || val != ExpectedFsGroup {
		return fmt.Errorf("security violation: fsGroup must be %d", ExpectedFsGroup)
	}
	if val, found, _ := unstructured.NestedBool(sc, "runAsNonRoot"); !found || !val {
		return fmt.Errorf("security violation: runAsNonRoot must be true")
	}

	// Check Seccomp Profile
	seccompType, found, _ := unstructured.NestedString(sc, "seccompProfile", "type")
	if !found || seccompType != ExpectedSeccompType {
		return fmt.Errorf("security violation: seccompProfile type must be '%s'", ExpectedSeccompType)
	}

	return nil
}

// validateContainer checks SecurityContext, Resources, and Probes
func validateContainer(container map[string]interface{}, isInit bool, requireProbes bool) error {
	name, _, _ := unstructured.NestedString(container, "name")

	// --- A. Security Context ---
	sc, found, _ := unstructured.NestedMap(container, "securityContext")
	if !found {
		return fmt.Errorf("security violation: container '%s' missing securityContext", name)
	}

	if val, _, _ := unstructured.NestedBool(sc, "allowPrivilegeEscalation"); val {
		return fmt.Errorf("security violation: container '%s' must have allowPrivilegeEscalation: false", name)
	}
	if val, _, _ := unstructured.NestedBool(sc, "privileged"); val {
		return fmt.Errorf("security violation: container '%s' cannot be privileged", name)
	}
	if val, found, _ := unstructured.NestedBool(sc, "readOnlyRootFilesystem"); !found || !val {
		return fmt.Errorf("security violation: container '%s' must have readOnlyRootFilesystem: true", name)
	}

	// Check Capabilities Drop ALL
	caps, found, _ := unstructured.NestedStringSlice(sc, "capabilities", "drop")
	dropAllFound := false
	if found {
		for _, cap := range caps {
			if strings.EqualFold(cap, ExpectedDropCap) {
				dropAllFound = true
				break
			}
		}
	}
	if !dropAllFound {
		return fmt.Errorf("security violation: container '%s' must drop '%s' capabilities", name, ExpectedDropCap)
	}

	// --- B. Resources ---
	// Check Requests
	if _, found, _ := unstructured.NestedMap(container, "resources", "requests"); !found {
		return fmt.Errorf("resource policy: container '%s' missing resource requests (cpu/memory)", name)
	}
	// Check Limits
	if _, found, _ := unstructured.NestedMap(container, "resources", "limits"); !found {
		return fmt.Errorf("resource policy: container '%s' missing resource limits (cpu/memory)", name)
	}

	// --- C. Probes (Liveness/Readiness) ---
	if requireProbes {
		if _, found, _ := unstructured.NestedMap(container, "livenessProbe"); !found {
			return fmt.Errorf("availability policy: container '%s' missing livenessProbe", name)
		}
		if _, found, _ := unstructured.NestedMap(container, "readinessProbe"); !found {
			return fmt.Errorf("availability policy: container '%s' missing readinessProbe", name)
		}
	}

	return nil
}

// EnforceSecurityPolicies mutates the unstructured object to inject mandatory defaults
// This runs BEFORE validation to try and fix simple omissions, but validation is the final gatekeeper.
func EnforceSecurityPolicies(obj *unstructured.Unstructured) {
	kind := obj.GetKind()
	var podSpecPath []string

	switch kind {
	case "Pod":
		podSpecPath = []string{"spec"}
	case "Deployment", "StatefulSet", "DaemonSet", "Job", "ReplicaSet":
		podSpecPath = []string{"spec", "template", "spec"}
	case "CronJob":
		podSpecPath = []string{"spec", "jobTemplate", "spec", "template", "spec"}
	default:
		return
	}

	// 1. Inject Pod Level Security Context
	currentPodSec, found, _ := unstructured.NestedMap(obj.Object, append(podSpecPath, "securityContext")...)
	if !found || currentPodSec == nil {
		_ = unstructured.SetNestedMap(obj.Object, podSecurityContext, append(podSpecPath, "securityContext")...)
	} else {
		for k, v := range podSecurityContext {
			if _, exists := currentPodSec[k]; !exists {
				currentPodSec[k] = v
			}
		}
		_ = unstructured.SetNestedMap(obj.Object, currentPodSec, append(podSpecPath, "securityContext")...)
	}

	// 2. Inject Container Defaults
	containersList, found, _ := unstructured.NestedSlice(obj.Object, append(podSpecPath, "containers")...)
	if found {
		updatedContainers := mutateContainers(containersList)
		_ = unstructured.SetNestedSlice(obj.Object, updatedContainers, append(podSpecPath, "containers")...)
	}

	initContainersList, found, _ := unstructured.NestedSlice(obj.Object, append(podSpecPath, "initContainers")...)
	if found {
		updatedInitContainers := mutateContainers(initContainersList)
		_ = unstructured.SetNestedSlice(obj.Object, updatedInitContainers, append(podSpecPath, "initContainers")...)
	}
}

func mutateContainers(containers []interface{}) []interface{} {
	var updated []interface{}

	for _, c := range containers {
		container, ok := c.(map[string]interface{})
		if !ok {
			updated = append(updated, c)
			continue
		}

		// A. Inject Security Context
		secCtx, _, _ := unstructured.NestedMap(container, "securityContext")
		if secCtx == nil {
			secCtx = make(map[string]interface{})
		}
		for k, v := range containerSecurityContext {
			if _, exists := secCtx[k]; !exists {
				secCtx[k] = v
			}
		}
		container["securityContext"] = secCtx

		// B. Inject Default Resources if missing
		resources, _, _ := unstructured.NestedMap(container, "resources")
		if resources == nil {
			container["resources"] = runtime.DeepCopyJSON(defaultResources)
		} else {
			// Check requests
			requests, _, _ := unstructured.NestedMap(resources, "requests")
			if requests == nil {
				_ = unstructured.SetNestedMap(resources, defaultResources["requests"].(map[string]interface{}), "requests")
			}
			// Check limits
			limits, _, _ := unstructured.NestedMap(resources, "limits")
			if limits == nil {
				_ = unstructured.SetNestedMap(resources, defaultResources["limits"].(map[string]interface{}), "limits")
			}
			container["resources"] = resources
		}

		updated = append(updated, container)
	}
	return updated
}

// GetDefaultResourceQuota returns a Unstructured ResourceQuota for a given namespace
func GetDefaultResourceQuota(namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "ResourceQuota",
			"metadata": map[string]interface{}{
				"name":      "default-ns-quota",
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"hard": map[string]interface{}{
					"requests.cpu":    "1",
					"requests.memory": "1Gi",
					"limits.cpu":      "2",
					"limits.memory":   "2Gi",
					"pods":            "10",
				},
			},
		},
	}
}
