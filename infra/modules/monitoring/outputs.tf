output "alarm_topic_arn" {
  description = "SNS topic receiving every alarm. Subscribe extra endpoints to it."
  value       = aws_sns_topic.alarms.arn
}

output "alarm_arns" {
  description = "All alarm ARNs created for this environment."
  value = [
    aws_cloudwatch_metric_alarm.auth_failures.arn,
    aws_cloudwatch_metric_alarm.http_5xx.arn,
    aws_cloudwatch_metric_alarm.latency_p95.arn,
    aws_cloudwatch_metric_alarm.rds_cpu.arn,
    aws_cloudwatch_metric_alarm.rds_storage.arn,
    aws_cloudwatch_metric_alarm.rds_connections.arn,
  ]
}

output "application_log_group_name" {
  description = "Log group holding the API application logs."
  value       = aws_cloudwatch_log_group.application.name
}
