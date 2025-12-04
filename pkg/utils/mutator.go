package utils

import (
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

// Default Security Contexts based on your UI policy
var (
	podSecurityContext = map[string]interface{}{
		"runAsUser":    int64(1000),
		"runAsGroup":   int64(3000),
		"fsGroup":      int64(2000),
		"runAsNonRoot": true,
		"seccompProfile": map[string]interface{}{
			"type": "RuntimeDefault",
		},
	}

	containerSecurityContext = map[string]interface{}{
		"allowPrivilegeEscalation": false,
		"readOnlyRootFilesystem":   true,
		"capabilities": map[string]interface{}{
			"drop": []interface{}{"ALL"},
		},
	}

	defaultResources = map[string]interface{}{
		"requests": map[string]interface{}{
			"cpu":    "10m",
			"memory": "10Mi",
		},
		"limits": map[string]interface{}{
			"cpu":    "20m",
			"memory": "20Mi",
		},
	}
)

// EnforceSecurityPolicies mutates the unstructured object to inject mandatory security contexts
func EnforceSecurityPolicies(obj *unstructured.Unstructured) {
	kind := obj.GetKind()

	// 1. Determine the path to the PodSpec based on the Kind
	var podSpecPath []string

	switch kind {
	case "Pod":
		podSpecPath = []string{"spec"}
	case "Deployment", "StatefulSet", "DaemonSet", "Job", "ReplicaSet":
		podSpecPath = []string{"spec", "template", "spec"}
	case "CronJob":
		podSpecPath = []string{"spec", "jobTemplate", "spec", "template", "spec"}
	default:
		// Not a workload resource we enforce (e.g., Service, ConfigMap), skip
		return
	}

	// 2. Inject Pod Level Security Context
	// We use nested map access to ensure we don't panic if fields are missing
	currentPodSec, found, _ := unstructured.NestedMap(obj.Object, append(podSpecPath, "securityContext")...)
	if !found || currentPodSec == nil {
		_ = unstructured.SetNestedMap(obj.Object, podSecurityContext, append(podSpecPath, "securityContext")...)
	} else {
		// Merge/Overwrite mandatory fields
		for k, v := range podSecurityContext {
			currentPodSec[k] = v
		}
		_ = unstructured.SetNestedMap(obj.Object, currentPodSec, append(podSpecPath, "securityContext")...)
	}

	// 3. Inject Container Level Security Contexts & Resources
	containersList, found, _ := unstructured.NestedSlice(obj.Object, append(podSpecPath, "containers")...)
	if found {
		updatedContainers := mutateContainers(containersList)
		_ = unstructured.SetNestedSlice(obj.Object, updatedContainers, append(podSpecPath, "containers")...)
	}

	// 4. Inject InitContainer Level Security Contexts & Resources
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
		// Enforce mandatory values
		for k, v := range containerSecurityContext {
			secCtx[k] = v
		}
		container["securityContext"] = secCtx

		// B. Inject Default Resources if missing
		resources, _, _ := unstructured.NestedMap(container, "resources")
		if resources == nil {
			// Deep copy default resources
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
