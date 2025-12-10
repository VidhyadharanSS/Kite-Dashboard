package utils

import (
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

// --- Configuration Constants ---
const (
	ExpectedRunAsUser   int64  = 1000
	ExpectedRunAsGroup  int64  = 3000
	ExpectedFsGroup     int64  = 2000
	ExpectedSeccompType string = "RuntimeDefault"
	ExpectedDropCap     string = "ALL"
	MinMemoryRequest    string = "10Mi"
	MinCpuRequest       string = "10m"
)

var (
	// SensitivePaths blocked from hostPath mounting
	// Added /home and /root based on your request
	SensitivePaths = []string{
		"/", "/boot", "/proc", "/etc", "/var", "/sys", "/dev", "/usr", "/run", "/home", "/root",
	}

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

func ValidateResourceSecurity(obj *unstructured.Unstructured) error {
	kind := obj.GetKind()
	var podSpecPath []string

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
		return nil
	}

	podSpec, found, _ := unstructured.NestedMap(obj.Object, podSpecPath...)
	if !found {
		return fmt.Errorf("invalid resource: could not find PodSpec")
	}

	if err := validateVolumes(podSpec); err != nil {
		return err
	}

	if err := validatePodSecurityContext(podSpec); err != nil {
		return err
	}

	requireProbes := kind != "Job" && kind != "CronJob"

	containers, _, _ := unstructured.NestedSlice(podSpec, "containers")
	for _, c := range containers {
		if err := validateContainer(c.(map[string]interface{}), false, requireProbes); err != nil {
			return err
		}
	}

	initContainers, _, _ := unstructured.NestedSlice(podSpec, "initContainers")
	for _, c := range initContainers {
		if err := validateContainer(c.(map[string]interface{}), true, false); err != nil {
			return err
		}
	}

	return nil
}

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

	seccompType, found, _ := unstructured.NestedString(sc, "seccompProfile", "type")
	if !found || seccompType != ExpectedSeccompType {
		return fmt.Errorf("security violation: seccompProfile type must be '%s'", ExpectedSeccompType)
	}

	return nil
}

func validateContainer(container map[string]interface{}, isInit bool, requireProbes bool) error {
	name, _, _ := unstructured.NestedString(container, "name")

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

	if _, found, _ := unstructured.NestedMap(container, "resources", "requests"); !found {
		return fmt.Errorf("resource policy: container '%s' missing resource requests (cpu/memory)", name)
	}
	if _, found, _ := unstructured.NestedMap(container, "resources", "limits"); !found {
		return fmt.Errorf("resource policy: container '%s' missing resource limits (cpu/memory)", name)
	}

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

		resources, _, _ := unstructured.NestedMap(container, "resources")
		if resources == nil {
			container["resources"] = runtime.DeepCopyJSON(defaultResources)
		} else {
			requests, _, _ := unstructured.NestedMap(resources, "requests")
			if requests == nil {
				_ = unstructured.SetNestedMap(resources, defaultResources["requests"].(map[string]interface{}), "requests")
			}
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
