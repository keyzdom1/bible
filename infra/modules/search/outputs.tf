output "endpoint" {
  description = "Set as OPENSEARCH_URL (https://...). Only reachable from inside the VPC."
  value       = "https://${aws_opensearch_domain.this.endpoint}"
}

output "domain_arn" {
  description = "Domain ARN, used by IAM policies."
  value       = aws_opensearch_domain.this.arn
}

output "domain_name" {
  description = "OpenSearch domain name."
  value       = aws_opensearch_domain.this.domain_name
}

output "master_username" {
  description = "Set as OPENSEARCH_USERNAME."
  value       = local.master_username
}

output "master_password" {
  description = "Set as OPENSEARCH_PASSWORD. Sensitive: contains the password."
  sensitive   = true
  value       = random_password.master.result
}

output "security_group_id" {
  description = "Security group attached to the domain."
  value       = aws_security_group.this.id
}
