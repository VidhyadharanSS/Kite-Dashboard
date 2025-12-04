package middleware

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/logx"
	"github.com/zxh326/kite/pkg/model"
)

// AuditLogger logs user activities in the Kite UI (not HTTP details)
func AuditLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		method := c.Request.Method
		query := c.Request.URL.Query()

		// Process the request
		c.Next()

		// Only log significant user activities, not every HTTP request
		if !shouldLogUserActivity(method, path) {
			return
		}

		// Get user identity
		userIdentity := "unauthenticated"
		if u, exists := c.Get("user"); exists {
			if user, ok := u.(model.User); ok {
				userIdentity = user.Username
			}
		}

		// Get cluster name
		cluster := "-"
		if v, exists := c.Get(ClusterNameKey); exists {
			if cName, ok := v.(string); ok {
				cluster = cName
			}
		}

		// Parse activity from path
		activity := parseUserActivity(method, path, query)
		if activity == "" {
			return
		}

		// Log user activity
		statusCode := c.Writer.Status()
		level := "INFO"
		if statusCode >= 500 {
			level = "ERROR"
		} else if statusCode >= 400 {
			level = "WARN"
		}

		logx.Activity("[%s] Cluster:%s | User:%s | %s | Status:%d",
			level, cluster, userIdentity, activity, statusCode)
	}
}

// shouldLogUserActivity determines if a request represents a user activity worth logging
func shouldLogUserActivity(method, path string) bool {
	// Log authentication activities
	if strings.Contains(path, "/api/auth/login") ||
		strings.Contains(path, "/api/auth/logout") {
		return true
	}

	// Log terminal (pod and node) and log viewer access
	if strings.Contains(path, "/terminal/") ||
		strings.Contains(path, "/node-terminal/") ||
		strings.Contains(path, "/logs/") {
		return true
	}

	// Log Global Search
	if strings.Contains(path, "/api/v1/search") {
		return true
	}

	// Log resource modifications (POST, PUT, PATCH, DELETE)
	if method == http.MethodPost || method == http.MethodPut ||
		method == http.MethodPatch || method == http.MethodDelete {
		// Skip auth token refresh and health checks
		if strings.Contains(path, "/refresh") ||
			strings.Contains(path, "/healthz") ||
			strings.Contains(path, "/metrics") {
			return false
		}
		return true
	}

	// Log specific GET operations that represent user actions
	if strings.Contains(path, "/overview") ||
		strings.Contains(path, "/image/tags") {
		return true
	}

	return false
}

// parseUserActivity converts HTTP path into human-readable activity
func parseUserActivity(method, path string, query url.Values) string {
	// Clean query parameters from path for parsing logic
	cleanPath := path
	if idx := strings.Index(cleanPath, "?"); idx != -1 {
		cleanPath = cleanPath[:idx]
	}

	parts := strings.Split(strings.Trim(cleanPath, "/"), "/")

	// Authentication activities
	if strings.Contains(path, "/api/auth/login") {
		return "User logged in"
	}
	if strings.Contains(path, "/api/auth/logout") {
		return "User logged out"
	}

	// Terminal access
	if strings.Contains(path, "/terminal/") {
		namespace, podName := extractNamespaceAndPod(cleanPath, "terminal")
		return fmt.Sprintf("Opened terminal for pod '%s' in namespace '%s'", podName, namespace)
	}
	if strings.Contains(path, "/node-terminal/") {
		nodeName := extractNodeName(cleanPath, "node-terminal")
		return fmt.Sprintf("Opened terminal for node '%s'", nodeName)
	}

	// Log viewer access
	if strings.Contains(path, "/logs/") {
		namespace, podName := extractNamespaceAndPod(cleanPath, "logs")
		return fmt.Sprintf("Viewed logs for pod '%s' in namespace '%s'", podName, namespace)
	}

	// Overview page
	if strings.Contains(path, "/overview") {
		return "Viewed cluster overview"
	}

	// Global Search
	if strings.Contains(path, "/search") {
		q := query.Get("q")
		if q != "" {
			return fmt.Sprintf("Performed global search for: '%s'", q)
		}
		return "Performed global search"
	}

	// Image Tags
	if strings.Contains(path, "/image/tags") {
		image := query.Get("image")
		return fmt.Sprintf("Looked up image tags for: '%s'", image)
	}

	// Resource Apply (Direct YAML/JSON apply)
	if strings.Contains(path, "/resources/apply") && method == http.MethodPost {
		return "Applied raw resource configuration"
	}

	// Standard Resource operations (CRUD)
	if len(parts) >= 3 && parts[0] == "api" && parts[1] == "v1" {
		// Check for Admin/Special routes first
		if parts[2] == "admin" {
			return parseAdminActivity(method, path)
		}

		resourceType, namespace, resourceName := parseResourceFromParts(parts[2:])
		if resourceType == "-" {
			return ""
		}

		switch method {
		case http.MethodPost:
			return fmt.Sprintf("Created %s '%s' in namespace '%s'", resourceType, resourceName, namespace)
		case http.MethodPut:
			return fmt.Sprintf("Updated %s '%s' in namespace '%s'", resourceType, resourceName, namespace)
		case http.MethodPatch:
			return fmt.Sprintf("Patched %s '%s' in namespace '%s'", resourceType, resourceName, namespace)
		case http.MethodDelete:
			return fmt.Sprintf("Deleted %s '%s' from namespace '%s'", resourceType, resourceName, namespace)
		}
	}

	return ""
}

// extractNamespaceAndPod extracts namespace and pod name from paths
func extractNamespaceAndPod(path, prefix string) (string, string) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		if part == prefix && i+2 < len(parts) {
			return parts[i+1], parts[i+2]
		}
	}
	return "unknown", "unknown"
}

// extractNodeName extracts node name from paths
func extractNodeName(path, prefix string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		if part == prefix && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return "unknown"
}

// parseResourceFromParts parses resource details from API path parts
func parseResourceFromParts(parts []string) (resourceType, namespace, resourceName string) {
	if len(parts) == 0 {
		return "-", "-", "-"
	}

	// Handle namespaced resources: /namespaces/{ns}/{resource}/{name}
	if parts[0] == "namespaces" && len(parts) >= 3 {
		namespace = parts[1]
		resourceType = parts[2]
		if len(parts) > 3 {
			resourceName = parts[3]
		} else {
			resourceName = "-"
		}
		return resourceType, namespace, resourceName
	}

	// Handle cluster-scoped resources: /{resource}/{name}
	resourceType = parts[0]
	if len(parts) > 1 {
		resourceName = parts[1]
	} else {
		resourceName = "-"
	}
	return resourceType, "cluster-scope", resourceName
}

// parseAdminActivity parses admin-related activities
func parseAdminActivity(method, path string) string {
	if strings.Contains(path, "/clusters") {
		switch method {
		case http.MethodPost:
			if strings.Contains(path, "/import") {
				return "Admin imported cluster"
			}
			return "Admin created cluster"
		case http.MethodPut:
			return "Admin updated cluster configuration"
		case http.MethodDelete:
			return "Admin deleted cluster"
		}
	}

	if strings.Contains(path, "/users") {
		switch method {
		case http.MethodPost:
			if strings.Contains(path, "/create_super_user") {
				return "Admin created super user"
			}
			if strings.Contains(path, "/reset_password") {
				return "Admin reset user password"
			}
			if strings.Contains(path, "/enable") {
				return "Admin toggled user enabled status"
			}
			return "Admin created user"
		case http.MethodPut:
			return "Admin updated user"
		case http.MethodDelete:
			return "Admin deleted user"
		}
	}

	if strings.Contains(path, "/roles") {
		switch method {
		case http.MethodPost:
			if strings.Contains(path, "/assign") {
				return "Admin assigned role to user"
			}
			return "Admin created role"
		case http.MethodPut:
			return "Admin updated role"
		case http.MethodDelete:
			if strings.Contains(path, "/assign") {
				return "Admin revoked role from user"
			}
			return "Admin deleted role"
		}
	}

	if strings.Contains(path, "/apikeys") {
		switch method {
		case http.MethodPost:
			return "Admin created API key"
		case http.MethodDelete:
			return "Admin deleted API key"
		}
	}

	if strings.Contains(path, "/oauth-providers") {
		switch method {
		case http.MethodPost:
			return "Admin created OAuth provider"
		case http.MethodPut:
			return "Admin updated OAuth provider"
		case http.MethodDelete:
			return "Admin deleted OAuth provider"
		}
	}

	return "Admin performed operation"
}
