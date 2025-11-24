package middleware

import (
	"fmt"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/model"
)

func AuditLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Capture start time
		start := time.Now()
		
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// Process request
		c.Next()

		// Calculate details after request is processed
		end := time.Now()
		latency := end.Sub(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		statusCode := c.Writer.Status()

		if raw != "" {
			path = path + "?" + raw
		}

		// Extract User Identity
		var userIdentity string
		if u, exists := c.Get("user"); exists {
			if user, ok := u.(model.User); ok {
				// For OAuth users, Username usually holds the email.
				// For local users, it holds the login username.
				userIdentity = user.Username
			}
		}
		if userIdentity == "" {
			userIdentity = "unauthenticated"
		}

		// Extract Cluster Name
		// We use the same key as the default logger
		cluster := "-"
		if v, exists := c.Get(ClusterNameKey); exists {
			if cName, ok := v.(string); ok {
				cluster = cName
			}
		}

		// Format: IP - Time "METHOD PATH" Status Duration Cluster User
		// Matches PDF: 10.244.2.0 - 2025-11-21 14:03:55 "GET /..." 200 673µs kubernetes-admin@kubernetes vidhyadharan.ss@zohocorp.com
		logLine := fmt.Sprintf("%s - %s \"%s %s\" %d %v %s %s\n",
			clientIP,
			end.Format("2006-01-02 15:04:05"),
			method,
			path,
			statusCode,
			latency,
			cluster,
			userIdentity,
		)

		// Append to application.log
		f, err := os.OpenFile("application.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err == nil {
			defer f.Close()
			_, _ = f.WriteString(logLine)
		} else {
			fmt.Printf("Error writing audit log: %v\n", err)
		}
	}
}