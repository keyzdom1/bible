output "distribution_domain" {
  description = "Public origin of the app (https://dxxxx.cloudfront.net). Serve the web app here and point NEXT_PUBLIC_API_BASE_URL at the same origin."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "distribution_id" {
  description = "Distribution id for invalidations after a web deploy."
  value       = aws_cloudfront_distribution.app.id
}

output "distribution_arn" {
  description = "Distribution ARN."
  value       = aws_cloudfront_distribution.app.arn
}

output "waf_acl_arn" {
  description = "WAF web ACL protecting the distribution."
  value       = aws_wafv2_web_acl.this.arn
}
