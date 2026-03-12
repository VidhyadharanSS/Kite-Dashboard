package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/model"
)

func ListUserSessions(c *gin.Context) {
	user := c.MustGet("user").(model.User)
	sessions, err := model.ListUserSessions(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sessions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

func DeleteUserSession(c *gin.Context) {
	user := c.MustGet("user").(model.User)
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session ID"})
		return
	}

	if err := model.DeleteUserSession(user.ID, uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "session removed"})
}

func ListAllSessions(c *gin.Context) {
	var sessions []model.UserSession
	if err := model.DB.Preload("User").Order("last_used_at desc").Limit(100).Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list all sessions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}
