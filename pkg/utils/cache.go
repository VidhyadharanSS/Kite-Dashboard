package utils

import (
	"sync"
	"time"
)

type cacheItem struct {
	value      interface{}
	expiration int64
}

// TTLKV is a simple thread-safe TTL cache
type TTLKV struct {
	items map[string]cacheItem
	mu    sync.RWMutex
}

func NewTTLKV() *TTLKV {
	c := &TTLKV{
		items: make(map[string]cacheItem),
	}
	// Cleanup goroutine
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			c.mu.Lock()
			now := time.Now().UnixNano()
			for k, v := range c.items {
				if v.expiration > 0 && now > v.expiration {
					delete(c.items, k)
				}
			}
			c.mu.Unlock()
		}
	}()
	return c
}

func (c *TTLKV) Set(key string, value interface{}, ttl time.Duration) {
	var exp int64
	if ttl > 0 {
		exp = time.Now().Add(ttl).UnixNano()
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = cacheItem{
		value:      value,
		expiration: exp,
	}
}

func (c *TTLKV) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	item, found := c.items[key]
	if !found {
		return nil, false
	}
	if item.expiration > 0 && time.Now().UnixNano() > item.expiration {
		return nil, false
	}
	return item.value, true
}

func (c *TTLKV) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
}
