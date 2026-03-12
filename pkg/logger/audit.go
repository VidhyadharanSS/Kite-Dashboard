package logger

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/zxh326/kite/pkg/common"
)

type AuditEntry struct {
	User      string `json:"user"`
	Action    string `json:"action"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Timestamp string `json:"timestamp"`
	Duration  string `json:"duration,omitempty"`
	Message   string `json:"message"`
}

func Audit(user, action, resource, namespace, cluster, message string, duration ...time.Duration) {
	if !common.LogEnableAudit || AuditLogger == nil {
		return
	}

	durStr := ""
	if len(duration) > 0 {
		durStr = duration[0].String()
	}

	entry := AuditEntry{
		User:      user,
		Action:    action,
		Resource:  resource,
		Namespace: namespace,
		Cluster:   cluster,
		Timestamp: time.Now().In(time.Local).Format("2006-01-02 15:04:05"),
		Duration:  durStr,
		Message:   message,
	}

	if common.LogFormat == "json" {
		b, _ := json.Marshal(entry)
		fmt.Fprintln(AuditLogger, string(b))
	} else {
		// User ssvd performed GET on /api/v1/admin/roles/ at 2026-02-10 23:08:47
		durText := ""
		if entry.Duration != "" {
			durText = fmt.Sprintf("in %s ", entry.Duration)
		}
		fmt.Fprintf(AuditLogger, "User %s performed %s on %s in %s/%s at %s %s: %s\n",
			entry.User, entry.Action, entry.Resource, entry.Cluster, entry.Namespace, entry.Timestamp, durText, entry.Message)
	}
}
