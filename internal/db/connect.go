package db

import (
	"context"
	"database/sql"
	"time"
)

func Connect(databaseURL string) (*sql.DB, error) {
	
	dbconn, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, err
	}
	
	dbconn.SetMaxOpenConns(100)
	dbconn.SetMaxIdleConns(90)
	dbconn.SetConnMaxLifetime(30*time.Minute)
	dbconn.SetConnMaxIdleTime(5*time.Minute)
	
	cxt, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	err = dbconn.PingContext(cxt)
	if err != nil {
		return nil, err
	}

	return dbconn, nil
}
