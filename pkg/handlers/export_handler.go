package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/handlers/resources"
	"k8s.io/apimachinery/pkg/api/meta"
	"sigs.k8s.io/yaml"
)

// ExportResource exports a single resource as YAML or JSON
func ExportResource(c *gin.Context) {
	resource := c.Param("resource")
	namespace := c.Param("namespace")
	name := c.Param("name")
	format := c.DefaultQuery("format", "yaml")

	handler, err := resources.GetHandler(resource)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("unsupported resource type: %s", resource)})
		return
	}

	obj, err := handler.GetResource(c, namespace, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Clean managed fields for cleaner export
	accessor, err := meta.Accessor(obj)
	if err == nil {
		accessor.SetManagedFields(nil)
		// Remove kubectl annotation
		anno := accessor.GetAnnotations()
		if anno != nil {
			delete(anno, "kubectl.kubernetes.io/last-applied-configuration")
			accessor.SetAnnotations(anno)
		}
		// Remove resourceVersion for clean re-apply
		accessor.SetResourceVersion("")
		// Remove UID
		accessor.SetUID("")
	}

	filename := fmt.Sprintf("%s-%s", resource, name)
	if namespace != "" && namespace != "_all" {
		filename = fmt.Sprintf("%s-%s-%s", resource, namespace, name)
	}

	switch strings.ToLower(format) {
	case "json":
		jsonData, err := json.MarshalIndent(obj, "", "  ")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to marshal to JSON"})
			return
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.json", filename))
		c.Data(http.StatusOK, "application/json", jsonData)

	case "yaml":
		fallthrough
	default:
		jsonData, err := json.Marshal(obj)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to marshal resource"})
			return
		}
		yamlData, err := yaml.JSONToYAML(jsonData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to convert to YAML"})
			return
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.yaml", filename))
		c.Data(http.StatusOK, "application/x-yaml", yamlData)
	}
}
