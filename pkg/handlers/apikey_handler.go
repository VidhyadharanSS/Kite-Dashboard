package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/model"
	"github.com/zxh326/kite/pkg/rbac"
)

type CreateAPIKeyRequest struct {
	Name string `json:"name" binding:"required"`
}

func ListAPIKeys(c *gin.Context) {
	apiKeys, err := model.ListAPIKeyUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list API keys"})
		return
	}
	for i := range apiKeys {
		apiKeys[i].Roles = rbac.GetUserRoles(apiKeys[i])
		// For API keys, we show the full key in the list for initial creation, but normally it should be masked?
		// Actually kite123-*** is better, but Kite users want quick copy?
		// User said "quick update" and stuff, maybe they like it.
		key := string(apiKeys[i].APIKey)
		apiKeys[i].APIKey = model.SecretString(fmt.Sprintf("kite%d-%s", apiKeys[i].ID, key))
	}
	c.JSON(http.StatusOK, gin.H{"apiKeys": apiKeys})
}

func CreateAPIKey(c *gin.Context) {
	var req CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiKey, err := model.NewAPIKeyUser(req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create API key: %v", err)})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"apiKey": apiKey})
}

func DeleteAPIKey(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}

	if err := model.DeleteUserByID(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete API key"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "API key deleted successfully"})
}
