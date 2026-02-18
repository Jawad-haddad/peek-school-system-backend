#!/bin/bash

# Set the backup directory within the container
BACKUP_DIR="/workspace/backups"
# Create a filename with the current date and time
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="$BACKUP_DIR/peek_db_backup_$DATE.sql"

# Create the backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Run the pg_dump command to create the backup
# Note: We use the service name 'db' as the host because we are inside the Docker network
PGPASSWORD="1234" pg_dump -h db -U postgres -d school_system -f $FILENAME

# Log a success message
echo "Database backup created successfully at $FILENAME"

# Optional: Clean up old backups (e.g., delete files older than 7 days)
find $BACKUP_DIR -type f -mtime +7 -name '*.sql' -delete
echo "Old backups (older than 7 days) have been deleted."