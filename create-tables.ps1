# Quizzes table indexes JSON
$quizzesIndexesJson = @"
[
    {
        "IndexName": "sessionCode-index",
        "KeySchema": [{"AttributeName":"sessionCode","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    },
    {
        "IndexName": "createdAt-index",
        "KeySchema": [
            {"AttributeName":"archived","KeyType":"HASH"},
            {"AttributeName":"createdAt","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }
]
"@

$participantsIndexesJson = @"
[
    {
        "IndexName": "quizId-index",
        "KeySchema": [{"AttributeName":"quizId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    },
    {
        "IndexName": "sessionId-index",
        "KeySchema": [{"AttributeName":"sessionId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    },
    {
        "IndexName": "socketId-index",
        "KeySchema": [{"AttributeName":"socketId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }
]
"@

# Write JSON to temporary files
$Utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllLines("quizzes-indexes.json", $quizzesIndexesJson, $Utf8NoBomEncoding)
[System.IO.File]::WriteAllLines("participants-indexes.json", $participantsIndexesJson, $Utf8NoBomEncoding)

# Create Quizzes table
aws dynamodb create-table `
    --table-name Quizzes `
    --attribute-definitions `
        AttributeName=id,AttributeType=S `
        AttributeName=sessionCode,AttributeType=S `
        AttributeName=archived,AttributeType=B `
        AttributeName=createdAt,AttributeType=S `
    --key-schema `
        AttributeName=id,KeyType=HASH `
    --global-secondary-indexes file://quizzes-indexes.json `
    --provisioned-throughput `
        ReadCapacityUnits=5,WriteCapacityUnits=5 `
    --endpoint-url http://localhost:8000

# Create Participants table
aws dynamodb create-table `
    --table-name Participants `
    --attribute-definitions `
        AttributeName=id,AttributeType=S `
        AttributeName=quizId,AttributeType=S `
        AttributeName=sessionId,AttributeType=S `
        AttributeName=socketId,AttributeType=S `
    --key-schema `
        AttributeName=id,KeyType=HASH `
    --global-secondary-indexes file://participants-indexes.json `
    --provisioned-throughput `
        ReadCapacityUnits=5,WriteCapacityUnits=5 `
    --endpoint-url http://localhost:8000

# Clean up temporary files
Remove-Item "quizzes-indexes.json"
Remove-Item "participants-indexes.json"

Write-Host "DynamoDB tables created successfully"
