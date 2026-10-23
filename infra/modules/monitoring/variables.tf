variable "name" {
  description = "Name prefix for alarms, used in alarm names and the custom namespace."
  type        = string
}

variable "alarm_email" {
  description = "Email address subscribed to alarm notifications. Confirm the subscription after the first apply."
  type        = string
  default     = null
}

variable "eb_environment_name" {
  description = "Elastic Beanstalk environment name (CloudWatch dimension)."
  type        = string
}

variable "eb_environment_id" {
  description = "Elastic Beanstalk environment id (CloudWatch dimension)."
  type        = string
}

variable "application_log_group_name" {
  description = "Log group receiving the Elastic Beanstalk application logs; the auth-failure filter reads it."
  type        = string
}

variable "db_instance_id" {
  description = "RDS instance identifier (CloudWatch dimension)."
  type        = string
}

variable "log_retention_days" {
  description = "Retention for the application log group."
  type        = number
  default     = 30
}

variable "http_5xx_threshold" {
  description = "5xx responses per 5 minutes before alarming."
  type        = number
  default     = 10
}

variable "latency_threshold_ms" {
  description = "p95 latency in milliseconds before alarming."
  type        = number
  default     = 2000
}

variable "auth_failure_threshold" {
  description = "Authentication failures per 5 minutes before alarming."
  type        = number
  default     = 25
}

variable "rds_connection_threshold" {
  description = "Database connection count before alarming."
  type        = number
  default     = 80
}
