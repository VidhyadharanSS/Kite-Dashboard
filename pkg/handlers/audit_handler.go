package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/model"
)

// ListAuditLogs returns paginated audit logs with optional filters
func ListAuditLogs(c *gin.Context) {
	q := model.AuditLogQuery{
		Level:     c.Query("level"),
		Cluster:   c.Query("cluster"),
		Username:  c.Query("username"),
		Resource:  c.Query("resource"),
		Namespace: c.Query("namespace"),
		Action:    c.Query("action"),
	}

	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			q.Page = v
		}
	}
	if p := c.Query("pageSize"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			q.PageSize = v
		}
	}

	if s := c.Query("startTime"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			q.StartTime = &t
		}
	}
	if s := c.Query("endTime"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			q.EndTime = &t
		}
	}

	resp, err := model.ListAuditLogs(q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query audit logs: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// GetAuditLogStats returns aggregated statistics for audit logs
func GetAuditLogStats(c *gin.Context) {
	stats, err := model.GetAuditLogStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get audit log stats: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// PurgeAuditLogs deletes audit logs older than specified retention days
func PurgeAuditLogs(c *gin.Context) {
	daysStr := c.DefaultQuery("days", "90")
	days, err := strconv.Atoi(daysStr)
	if err != nil || days < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid retention days"})
		return
	}

	deleted, err := model.PurgeAuditLogs(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to purge audit logs: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "audit logs purged successfully",
		"deletedEntries": deleted,
	})
}
