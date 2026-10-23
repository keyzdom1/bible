output "state_bucket" {
  description = "Bucket to use as the backend for every environment."
  value       = aws_s3_bucket.state.id
}

output "lock_table" {
  description = "DynamoDB table to use as the backend lock for every environment."
  value       = aws_dynamodb_table.lock.name
}

output "backend_config" {
  description = "Copy into an environment's backend.tf or pass with -backend-config."
  value = {
    bucket         = aws_s3_bucket.state.id
    key            = "holyword/<env>/terraform.tfstate"
    region         = var.region
    dynamodb_table = aws_dynamodb_table.lock.name
    encrypt        = true
  }
}
