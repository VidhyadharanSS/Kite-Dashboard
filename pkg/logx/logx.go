package logx

import (
	"fmt"
	"io"
	"os"
	"runtime/debug"
	"sync"
	"time"

	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	L            *Logger
	mu           sync.Mutex
	initialized  bool
	accessLogger *lumberjack.Logger
	appLogger    *lumberjack.Logger
)

type Logger struct {
	logDir string
}

// Init initializes the logging system with rotation
func Init(logDir string) error {
	mu.Lock()
	defer mu.Unlock()

	if initialized {
		return nil
	}

	// Create log directory if it doesn't exist
	// 0777 allows read/write for everyone (fixing docker user issues)
	if err := os.MkdirAll(logDir, 0777); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}

	accessPath := fmt.Sprintf("%s/access.log", logDir)
	appPath := fmt.Sprintf("%s/application.log", logDir)

	// Configure Access Log Rotation
	accessLogger = &lumberjack.Logger{
		Filename:   accessPath,
		MaxSize:    10,   // megabytes
		MaxBackups: 5,    // number of files
		MaxAge:     30,   // days
		Compress:   true, // compress rolled files
	}

	// Configure Application Log Rotation
	appLogger = &lumberjack.Logger{
		Filename:   appPath,
		MaxSize:    10,
		MaxBackups: 5,
		MaxAge:     30,
		Compress:   true,
	}

	// --- FIX: Force permissions on files immediately ---
	// Write empty bytes to ensure file creation
	accessLogger.Write([]byte(""))
	appLogger.Write([]byte(""))

	// Set permissions so 'cat' works inside shell
	os.Chmod(accessPath, 0666)
	os.Chmod(appPath, 0666)
	// --------------------------------------------------

	L = &Logger{logDir: logDir}
	initialized = true
	return nil
}

// Close closes all log files
func Close() error {
	mu.Lock()
	defer mu.Unlock()

	if !initialized {
		return nil
	}

	var errs []error
	if accessLogger != nil {
		if err := accessLogger.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if appLogger != nil {
		if err := appLogger.Close(); err != nil {
			errs = append(errs, err)
		}
	}

	initialized = false
	if len(errs) > 0 {
		return fmt.Errorf("errors closing log files: %v", errs)
	}
	return nil
}

// writeToFile writes to the rotating logger
func writeToFile(w io.Writer, message string) {
	mu.Lock()
	defer mu.Unlock()

	if w != nil {
		w.Write([]byte(message))
	}
}

// Access writes HTTP access logs to access.log only
func Access(message string) {
	writeToFile(accessLogger, message)
}

// Debug writes debug messages to application.log and stdout
func Debug(format string, args ...interface{}) {
	message := fmt.Sprintf("[DEBUG] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

// Info writes info messages to application.log and stdout
func Info(format string, args ...interface{}) {
	message := fmt.Sprintf("[INFO] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

// Warn writes warning messages to application.log and stdout
func Warn(format string, args ...interface{}) {
	message := fmt.Sprintf("[WARN] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

// Error writes error messages to application.log and stdout
func Error(format string, args ...interface{}) {
	message := fmt.Sprintf("[ERROR] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

// PanicToAppLog logs panic information to application.log and stdout
func PanicToAppLog(err interface{}) {
	stack := string(debug.Stack())
	message := fmt.Sprintf("[PANIC] %s | Error: %v\nStack Trace:\n%s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		err,
		stack,
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

// Activity logs user activity events to application.log and stdout
func Activity(format string, args ...interface{}) {
	message := fmt.Sprintf("[ACTIVITY] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}
