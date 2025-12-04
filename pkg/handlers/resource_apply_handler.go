package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/cluster"
	"github.com/zxh326/kite/pkg/common"
	"github.com/zxh326/kite/pkg/model"
	"github.com/zxh326/kite/pkg/rbac"
	"github.com/zxh326/kite/pkg/utils" // Ensure this import matches your module path
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/serializer/yaml"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/client"
	syaml "sigs.k8s.io/yaml"
)

type ResourceApplyHandler struct {
}

func NewResourceApplyHandler() *ResourceApplyHandler {
	return &ResourceApplyHandler{}
}

type ApplyResourceRequest struct {
	YAML string `json:"yaml" binding:"required"`
}

// ApplyResource applies a YAML resource to the cluster
func (h *ResourceApplyHandler) ApplyResource(c *gin.Context) {
	cs := c.MustGet("cluster").(*cluster.ClientSet)
	user := c.MustGet("user").(model.User)

	var req ApplyResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Decode YAML into unstructured object
	decodeUniversal := yaml.NewDecodingSerializer(unstructured.UnstructuredJSONScheme)
	obj := &unstructured.Unstructured{}

	_, _, err := decodeUniversal.Decode([]byte(req.YAML), nil, obj)
	if err != nil {
		klog.Errorf("Failed to decode YAML: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid YAML format: " + err.Error()})
		return
	}

	// === MUTATION LOGIC START ===
	// This acts like a Mutating Admission Controller
	// It injects security context, resources, and probes defaults
	utils.EnforceSecurityPolicies(obj)
	// === MUTATION LOGIC END ===

	resource := strings.ToLower(obj.GetKind()) + "s"
	if !rbac.CanAccess(user, resource, "create", cs.Name, obj.GetNamespace()) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": rbac.NoAccess(user.Key(), string(common.VerbCreate), resource, obj.GetNamespace(), cs.Name)})
		return
	}

	ctx := c.Request.Context()

	existingObj := &unstructured.Unstructured{}
	existingObj.SetGroupVersionKind(obj.GetObjectKind().GroupVersionKind())
	existingObj.SetName(obj.GetName())
	existingObj.SetNamespace(obj.GetNamespace())

	err = cs.K8sClient.Get(ctx, client.ObjectKey{
		Name:      obj.GetName(),
		Namespace: obj.GetNamespace(),
	}, existingObj)

	defer func() {
		previousYAML := []byte{}
		if existingObj.GetResourceVersion() != "" {
			existingObj.SetManagedFields(nil)
			previousYAML, _ = syaml.Marshal(existingObj)
		}
		errMessage := ""
		if err != nil {
			errMessage = err.Error()
		}
		// Log the modified YAML (obj) so we see what was actually applied after mutation
		appliedYAML, _ := syaml.Marshal(obj)

		model.DB.Create(&model.ResourceHistory{
			ClusterName:   cs.Name,
			ResourceType:  resource,
			ResourceName:  obj.GetName(),
			Namespace:     obj.GetNamespace(),
			OperationType: "apply",
			ResourceYAML:  string(appliedYAML), // Save the mutated YAML
			PreviousYAML:  string(previousYAML),
			OperatorID:    user.ID,
			Success:       err == nil,
			ErrorMessage:  errMessage,
		})
	}()

	switch {
	case apierrors.IsNotFound(err):
		if err := cs.K8sClient.Create(ctx, obj); err != nil {
			klog.Errorf("Failed to create resource: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create resource: " + err.Error()})
			return
		}

		// SPECIAL CASE: If we just created a Namespace, enforce Policy by creating a default ResourceQuota
		if obj.GetKind() == "Namespace" {
			go h.enforceNamespaceQuota(context.Background(), cs, obj.GetName())
		}

	case err == nil:
		obj.SetResourceVersion(existingObj.GetResourceVersion())
		if err := cs.K8sClient.Update(ctx, obj); err != nil {
			klog.Errorf("Failed to update resource: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update resource: " + err.Error()})
			return
		}
	default:
		klog.Errorf("Failed to get resource: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get resource: " + err.Error()})
		return
	}

	klog.Infof("Successfully applied resource: %s/%s", obj.GetKind(), obj.GetName())
	c.JSON(http.StatusOK, gin.H{
		"message":   "Resource applied successfully (Security Policies Enforced)",
		"kind":      obj.GetKind(),
		"name":      obj.GetName(),
		"namespace": obj.GetNamespace(),
	})
}

// enforceNamespaceQuota creates a default resource quota for new namespaces
func (h *ResourceApplyHandler) enforceNamespaceQuota(ctx context.Context, cs *cluster.ClientSet, namespace string) {
	quota := utils.GetDefaultResourceQuota(namespace)
	if err := cs.K8sClient.Create(ctx, quota); err != nil {
		klog.Errorf("Failed to create default quota for namespace %s: %v", namespace, err)
	} else {
		klog.Infof("Enforced default quota for new namespace: %s", namespace)
	}
}
