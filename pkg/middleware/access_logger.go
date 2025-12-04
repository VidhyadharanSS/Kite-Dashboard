package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/logx"
	"github.com/zxh326/kite/pkg/model"
)

// AccessLogger logs HTTP access details to access.log
func AccessLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		latency := time.Since(start)

		clientIP := c.ClientIP()
		method := c.Request.Method
		path := c.Request.URL.Path
		statusCode := c.Writer.Status()

		if raw := c.Request.URL.RawQuery; raw != "" {
			path = path + "?" + raw
		}

		userIdentity := "anonymous"
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

		logLine := fmt.Sprintf("%s - %s \"%s %s\" %d %v %s %s\n",
			clientIP,
			time.Now().Format("2006-01-02 15:04:05"),
			method,
			path,
			statusCode,
			latency,
			cluster,
			userIdentity,
		)

		logx.Access(logLine)
	}
}
