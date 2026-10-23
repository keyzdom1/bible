output "application_name" {
  description = "Elastic Beanstalk application name, used by the deploy workflow."
  value       = aws_elastic_beanstalk_application.this.name
}

output "environment_name" {
  description = "Elastic Beanstalk environment name, used by monitoring and the deploy workflow."
  value       = aws_elastic_beanstalk_environment.this.name
}

output "environment_id" {
  description = "Elastic Beanstalk environment id, a CloudWatch alarm dimension."
  value       = aws_elastic_beanstalk_environment.this.id
}

output "cname" {
  description = "Environment CNAME; becomes the CloudFront origin domain."
  value       = aws_elastic_beanstalk_environment.this.cname
}

output "security_group_id" {
  description = "Security group of the instances, referenced by database and OpenSearch ingress rules."
  value       = aws_security_group.this.id
}

output "service_role_arn" {
  description = "Elastic Beanstalk service role."
  value       = aws_iam_role.service.arn
}

output "instance_profile_arn" {
  description = "Instance profile attached to the EC2 instances."
  value       = aws_iam_instance_profile.this.arn
}

output "instance_role_name" {
  description = "Instance role name, for extra least-privilege policy attachments."
  value       = aws_iam_role.instance.name
}

output "log_group_name" {
  description = "CloudWatch log group EB streams instance logs into (EnvironmentName-Environment)."
  value       = "/aws/elasticbeanstalk/${aws_elastic_beanstalk_environment.this.name}-Environment"
}
