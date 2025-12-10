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

func Init(logDir string) error {
	mu.Lock()
	defer mu.Unlock()

	if initialized {
		return nil
	}

	if err := os.MkdirAll(logDir, 0777); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}

	accessPath := fmt.Sprintf("%s/access.log", logDir)
	appPath := fmt.Sprintf("%s/application.log", logDir)

	accessLogger = &lumberjack.Logger{
		Filename:   accessPath,
		MaxSize:    10,
		MaxBackups: 5,
		MaxAge:     30,
		Compress:   true,
	}

	appLogger = &lumberjack.Logger{
		Filename:   appPath,
		MaxSize:    10,
		MaxBackups: 5,
		MaxAge:     30,
		Compress:   true,
	}

	accessLogger.Write([]byte(""))
	appLogger.Write([]byte(""))

	os.Chmod(accessPath, 0666)
	os.Chmod(appPath, 0666)

	L = &Logger{logDir: logDir}
	initialized = true
	return nil
}

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

func writeToFile(w io.Writer, message string) {
	mu.Lock()
	defer mu.Unlock()

	if w != nil {
		w.Write([]byte(message))
	}
}

func Access(message string) {
	writeToFile(accessLogger, message)
}

func Debug(format string, args ...interface{}) {
	message := fmt.Sprintf("[DEBUG] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

func Info(format string, args ...interface{}) {
	message := fmt.Sprintf("[INFO] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

func Warn(format string, args ...interface{}) {
	message := fmt.Sprintf("[WARN] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

func Error(format string, args ...interface{}) {
	message := fmt.Sprintf("[ERROR] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}

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

func Activity(format string, args ...interface{}) {
	message := fmt.Sprintf("[ACTIVITY] %s | %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		fmt.Sprintf(format, args...),
	)
	writeToFile(appLogger, message)
	fmt.Print(message)
}
