output "endpoint" {
  description = "RDS endpoint hostname."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "PostgreSQL port."
  value       = aws_db_instance.this.port
}

output "instance_id" {
  description = "DB instance identifier, used by CloudWatch alarms."
  value       = aws_db_instance.this.id
}

output "security_group_id" {
  description = "Security group attached to the database."
  value       = aws_security_group.database.id
}

output "secret_arn" {
  description = "Secrets Manager ARN holding the master credentials as JSON."
  value       = aws_secretsmanager_secret.database.arn
}

output "database_url" {
  description = "Connection string for DATABASE_URL. Sensitive: contains the password."
  sensitive   = true
  value       = "postgres://${local.username}:${random_password.master.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${local.dbname}"
}
