package model

import (
	"log"
	"os"
	"sync"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/zxh326/kite/pkg/common"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	DB *gorm.DB

	once sync.Once
)

type Model struct {
	ID        uint      `json:"id" gorm:"primarykey"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func InitDB() {
	dsn := common.DBDSN

	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags), // io writer
		logger.Config{
			SlowThreshold: time.Second,
			LogLevel:      logger.Silent,
			Colorful:      false,
		},
	)

	var err error
	once.Do(func() {
		cfg := &gorm.Config{
			Logger: newLogger,
		}
		if common.DBType == "sqlite" {
			DB, err = gorm.Open(sqlite.Open(dsn), cfg)
			if err != nil {
				panic("failed to connect database: " + err.Error())
			}
		}

		if common.DBType == "mysql" {
			DB, err = gorm.Open(mysql.Open(dsn), cfg)
			if err != nil {
				panic("failed to connect database: " + err.Error())
			}
		}

		if common.DBType == "postgres" {
			DB, err = gorm.Open(postgres.Open(dsn), cfg)
			if err != nil {
				panic("failed to connect database: " + err.Error())
			}
		}
	})

	if DB == nil {
		panic("database connection is nil, check your DB_TYPE and DB_DSN settings")
	}

	// For SQLite: enable foreign keys and WAL mode for better concurrency
	if common.DBType == "sqlite" {
		if err := DB.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
			panic("failed to enable sqlite foreign keys: " + err.Error())
		}
		// WAL mode allows concurrent readers while writing, significantly
		// improving performance for the audit log writes + dashboard reads
		DB.Exec("PRAGMA journal_mode = WAL")
		DB.Exec("PRAGMA synchronous = NORMAL")
		DB.Exec("PRAGMA cache_size = -8000") // 8MB cache
		DB.Exec("PRAGMA busy_timeout = 5000") // 5s busy timeout
	}
	models := []interface{}{
		User{},
		Cluster{},
		OAuthProvider{},
		Role{},
		RoleAssignment{},
		ResourceHistory{},
		AuditLog{},
	}
	for _, model := range models {
		err = DB.AutoMigrate(model)
		if err != nil {
			panic("failed to migrate database: " + err.Error())
		}
	}

	if err := (&ResourceHistory{}).AfterMigrate(DB); err != nil {
		panic("failed to create resource history indexes: " + err.Error())
	}

	// Create indexes for audit_logs for efficient querying
	DB.Exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`)
	DB.Exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_lookup ON audit_logs (cluster, username, level, created_at DESC)`)

	sqldb, err := DB.DB()
	if err == nil {
		sqldb.SetMaxOpenConns(common.DBMaxOpenConns)
		sqldb.SetMaxIdleConns(common.DBMaxIdleConns)
		sqldb.SetConnMaxLifetime(common.DBMaxIdleTime)
	}
}
