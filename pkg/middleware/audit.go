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

func AuditLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		method := c.Request.Method
		query := c.Request.URL.Query()

		c.Next()

		if !shouldLogUserActivity(method, path) {
			return
		}

		userIdentity := "unauthenticated"
		if u, exists := c.Get("user"); exists {
			if user, ok := u.(model.User); ok {
				userIdentity = user.Username
			}
		}

		cluster := "-"
		if v, exists := c.Get(ClusterNameKey); exists {
			if cName, ok := v.(string); ok {
				cluster = cName
			}
		}

		activity := parseUserActivity(method, path, query)
		if activity == "" {
			return
		}

		statusCode := c.Writer.Status()
		level := "INFO"
		if statusCode >= 500 {
			level = "ERROR"
		} else if statusCode >= 400 {
			level = "WARN"
		}

		// Write to log file (backwards compatible)
		logx.Activity("[%s] Cluster:%s | User:%s | %s | Status:%d",
			level, cluster, userIdentity, activity, statusCode)

		// Persist to database for UI querying
		resource, namespace := extractResourceInfo(path)
		auditEntry := &model.AuditLog{
			Level:     level,
			Cluster:   cluster,
			Username:  userIdentity,
			Action:    activity,
			Resource:  resource,
			Namespace: namespace,
			Status:    statusCode,
			Method:    method,
			Path:      path,
		}
		// Insert asynchronously to not block the response
		go func() {
			if err := model.CreateAuditLog(auditEntry); err != nil {
				logx.Error("Failed to persist audit log: %v", err)
			}
		}()
	}
}

// extractResourceInfo parses the URL path to extract resource type and namespace
func extractResourceInfo(path string) (resource, namespace string) {
	cleanPath := path
	if idx := strings.Index(cleanPath, "?"); idx != -1 {
		cleanPath = cleanPath[:idx]
	}
	parts := strings.Split(strings.Trim(cleanPath, "/"), "/")

	// api/v1/{resource}/{namespace}/{name} or api/v1/admin/{resource}/...
	if len(parts) >= 3 && parts[0] == "api" && parts[1] == "v1" {
		remaining := parts[2:]
		if len(remaining) > 0 && remaining[0] == "admin" {
			if len(remaining) > 1 {
				return remaining[1], ""
			}
			return "admin", ""
		}
		if len(remaining) >= 1 {
			resource = remaining[0]
		}
		if len(remaining) >= 2 && remaining[1] != "_all" {
			namespace = remaining[1]
		}
		return resource, namespace
	}

	// Terminal, logs, etc.
	for _, prefix := range []string{"terminal", "node-terminal", "logs"} {
		if strings.Contains(path, "/"+prefix+"/") {
			for i, part := range parts {
				if part == prefix && i+1 < len(parts) {
					return prefix, parts[i+1]
				}
			}
			return prefix, ""
		}
	}

	return "", ""
}

func shouldLogUserActivity(method, path string) bool {

	if strings.Contains(path, "/api/auth/login") ||
		strings.Contains(path, "/api/auth/logout") {
		return true
	}

	if strings.Contains(path, "/terminal/") ||
		strings.Contains(path, "/node-terminal/") ||
		strings.Contains(path, "/logs/") {
		return true
	}

	if strings.Contains(path, "/api/v1/search") {
		return true
	}

	if method == http.MethodPost || method == http.MethodPut ||
		method == http.MethodPatch || method == http.MethodDelete {

		if strings.Contains(path, "/refresh") ||
			strings.Contains(path, "/healthz") ||
			strings.Contains(path, "/metrics") {
			return false
		}
		return true
	}

	if strings.Contains(path, "/overview") ||
		strings.Contains(path, "/image/tags") {
		return true
	}

	return false
}

func parseUserActivity(method, path string, query url.Values) string {

	cleanPath := path
	if idx := strings.Index(cleanPath, "?"); idx != -1 {
		cleanPath = cleanPath[:idx]
	}

	parts := strings.Split(strings.Trim(cleanPath, "/"), "/")

	if strings.Contains(path, "/api/auth/login") {
		return "User logged in"
	}
	if strings.Contains(path, "/api/auth/logout") {
		return "User logged out"
	}

	if strings.Contains(path, "/terminal/") {
		namespace, podName := extractNamespaceAndPod(cleanPath, "terminal")
		return fmt.Sprintf("Opened terminal for pod '%s' in namespace '%s'", podName, namespace)
	}
	if strings.Contains(path, "/node-terminal/") {
		nodeName := extractNodeName(cleanPath, "node-terminal")
		return fmt.Sprintf("Opened terminal for node '%s'", nodeName)
	}

	if strings.Contains(path, "/logs/") {
		namespace, podName := extractNamespaceAndPod(cleanPath, "logs")
		return fmt.Sprintf("Viewed logs for pod '%s' in namespace '%s'", podName, namespace)
	}

	if strings.Contains(path, "/overview") {
		return "Viewed cluster overview"
	}

	if strings.Contains(path, "/search") {
		q := query.Get("q")
		if q != "" {
			return fmt.Sprintf("Performed global search for: '%s'", q)
		}
		return "Performed global search"
	}

	if strings.Contains(path, "/image/tags") {
		image := query.Get("image")
		return fmt.Sprintf("Looked up image tags for: '%s'", image)
	}

	if strings.Contains(path, "/resources/apply") && method == http.MethodPost {
		return "Applied raw resource configuration"
	}

	if len(parts) >= 3 && parts[0] == "api" && parts[1] == "v1" {

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

func extractNamespaceAndPod(path, prefix string) (string, string) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		if part == prefix && i+2 < len(parts) {
			return parts[i+1], parts[i+2]
		}
	}
	return "unknown", "unknown"
}

func extractNodeName(path, prefix string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		if part == prefix && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return "unknown"
}

func parseResourceFromParts(parts []string) (resourceType, namespace, resourceName string) {
	if len(parts) == 0 {
		return "-", "-", "-"
	}

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

	resourceType = parts[0]
	if len(parts) > 1 {
		resourceName = parts[1]
	} else {
		resourceName = "-"
	}
	return resourceType, "cluster-scope", resourceName
}

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
