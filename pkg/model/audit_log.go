package model

import (
	"math"
	"time"
)

// AuditLog stores user activity records in the database for querying
type AuditLog struct {
	Model
	Level     string `json:"level" gorm:"type:varchar(10);not null;index"`
	Cluster   string `json:"cluster" gorm:"type:varchar(100);index"`
	Username  string `json:"username" gorm:"type:varchar(100);index"`
	Action    string `json:"action" gorm:"type:text;not null"`
	Resource  string `json:"resource,omitempty" gorm:"type:varchar(100);index"`
	Namespace string `json:"namespace,omitempty" gorm:"type:varchar(100);index"`
	Status    int    `json:"status" gorm:"type:int"`
	Method    string `json:"method,omitempty" gorm:"type:varchar(10)"`
	Path      string `json:"path,omitempty" gorm:"type:varchar(500)"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

func (AuditLog) AfterMigrate(db interface{ Exec(string, ...interface{}) interface{ Error() error } }) error {
	return nil
}

// CreateAuditLog persists a single audit log entry
func CreateAuditLog(log *AuditLog) error {
	return DB.Create(log).Error
}

// AuditLogQuery represents query parameters for listing audit logs
type AuditLogQuery struct {
	Level     string
	Cluster   string
	Username  string
	Resource  string
	Namespace string
	Action    string
	StartTime *time.Time
	EndTime   *time.Time
	Page      int
	PageSize  int
}

// AuditLogResponse is the paginated response for audit log queries
type AuditLogResponse struct {
	Data       []AuditLog `json:"data"`
	Pagination struct {
		Page        int   `json:"page"`
		PageSize    int   `json:"pageSize"`
		Total       int64 `json:"total"`
		TotalPages  int   `json:"totalPages"`
		HasNextPage bool  `json:"hasNextPage"`
		HasPrevPage bool  `json:"hasPrevPage"`
	} `json:"pagination"`
}

// ListAuditLogs queries audit logs with filtering and pagination
func ListAuditLogs(q AuditLogQuery) (*AuditLogResponse, error) {
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.PageSize <= 0 {
		q.PageSize = 50
	}
	if q.PageSize > 200 {
		q.PageSize = 200
	}

	tx := DB.Model(&AuditLog{})

	if q.Level != "" {
		tx = tx.Where("level = ?", q.Level)
	}
	if q.Cluster != "" {
		tx = tx.Where("cluster = ?", q.Cluster)
	}
	if q.Username != "" {
		tx = tx.Where("username LIKE ?", "%"+q.Username+"%")
	}
	if q.Resource != "" {
		tx = tx.Where("resource LIKE ?", "%"+q.Resource+"%")
	}
	if q.Namespace != "" {
		tx = tx.Where("namespace = ?", q.Namespace)
	}
	if q.Action != "" {
		tx = tx.Where("action LIKE ?", "%"+q.Action+"%")
	}
	if q.StartTime != nil {
		tx = tx.Where("created_at >= ?", q.StartTime)
	}
	if q.EndTime != nil {
		tx = tx.Where("created_at <= ?", q.EndTime)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, err
	}

	var logs []AuditLog
	offset := (q.Page - 1) * q.PageSize
	if err := tx.Order("created_at DESC").Offset(offset).Limit(q.PageSize).Find(&logs).Error; err != nil {
		return nil, err
	}

	totalPages := int(math.Ceil(float64(total) / float64(q.PageSize)))
	resp := &AuditLogResponse{
		Data: logs,
	}
	resp.Pagination.Page = q.Page
	resp.Pagination.PageSize = q.PageSize
	resp.Pagination.Total = total
	resp.Pagination.TotalPages = totalPages
	resp.Pagination.HasNextPage = q.Page < totalPages
	resp.Pagination.HasPrevPage = q.Page > 1

	return resp, nil
}

// PurgeAuditLogs deletes logs older than the given retention period
func PurgeAuditLogs(retentionDays int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := DB.Where("created_at < ?", cutoff).Delete(&AuditLog{})
	return result.RowsAffected, result.Error
}

// AuditLogStats returns summary statistics for audit logs
type AuditLogStats struct {
	TotalEntries  int64            `json:"totalEntries"`
	TodayEntries  int64            `json:"todayEntries"`
	LevelCounts   map[string]int64 `json:"levelCounts"`
	TopUsers      []UserActivity   `json:"topUsers"`
	TopResources  []ResourceCount  `json:"topResources"`
}

type UserActivity struct {
	Username string `json:"username"`
	Count    int64  `json:"count"`
}

type ResourceCount struct {
	Resource string `json:"resource"`
	Count    int64  `json:"count"`
}

// GetAuditLogStats returns aggregated statistics
func GetAuditLogStats() (*AuditLogStats, error) {
	stats := &AuditLogStats{
		LevelCounts: make(map[string]int64),
	}

	// Total entries
	if err := DB.Model(&AuditLog{}).Count(&stats.TotalEntries).Error; err != nil {
		return nil, err
	}

	// Today entries
	today := time.Now().Truncate(24 * time.Hour)
	if err := DB.Model(&AuditLog{}).Where("created_at >= ?", today).Count(&stats.TodayEntries).Error; err != nil {
		return nil, err
	}

	// Level counts
	type levelCount struct {
		Level string
		Count int64
	}
	var levelCounts []levelCount
	if err := DB.Model(&AuditLog{}).Select("level, count(*) as count").Group("level").Find(&levelCounts).Error; err != nil {
		return nil, err
	}
	for _, lc := range levelCounts {
		stats.LevelCounts[lc.Level] = lc.Count
	}

	// Top users (last 7 days)
	weekAgo := time.Now().AddDate(0, 0, -7)
	if err := DB.Model(&AuditLog{}).
		Select("username, count(*) as count").
		Where("created_at >= ? AND username != 'unauthenticated'", weekAgo).
		Group("username").
		Order("count DESC").
		Limit(10).
		Find(&stats.TopUsers).Error; err != nil {
		return nil, err
	}

	// Top resources
	if err := DB.Model(&AuditLog{}).
		Select("resource, count(*) as count").
		Where("created_at >= ? AND resource != ''", weekAgo).
		Group("resource").
		Order("count DESC").
		Limit(10).
		Find(&stats.TopResources).Error; err != nil {
		return nil, err
	}

	return stats, nil
}
