output "user_pool_id" {
  description = "Set as COGNITO_USER_POOL_ID."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "User pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "client_id" {
  description = "Set as COGNITO_CLIENT_ID."
  value       = aws_cognito_user_pool_client.this.id
}

output "hosted_ui_domain" {
  description = "Set as COGNITO_DOMAIN (holyword-xxx.auth.<region>.amazoncognito.com)."
  value       = aws_cognito_user_pool_domain.this.domain
}
