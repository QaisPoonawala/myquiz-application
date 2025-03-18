# Delete Participants table
aws dynamodb delete-table `
    --table-name Participants `
    --endpoint-url http://localhost:8000

# Delete Quizzes table
aws dynamodb delete-table `
    --table-name Quizzes `
    --endpoint-url http://localhost:8000

Write-Host "DynamoDB tables deleted successfully"
