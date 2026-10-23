variable "name" {
  description = "Environment name, e.g. holyword-api-dev. Also the EB environment name."
  type        = string
}

variable "application_name" {
  description = "Elastic Beanstalk application name. API and web each get their own."
  type        = string
}

variable "application_description" {
  description = "Shown in the Elastic Beanstalk console."
  type        = string
  default     = "HolyWord application"
}

variable "vpc_id" {
  description = "VPC for the environment."
  type        = string
}

variable "vpc_cidr_block" {
  description = "VPC CIDR allowed to reach the load balancer. Kept as the VPC range because CloudFront reaches it through its edge."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for the load balancer and instances."
  type        = list(string)
}

variable "environment_variables" {
  description = "Environment properties (plain strings). Secrets are assembled by the environment from Terraform outputs, never written to files."
  type        = map(string)
  default     = {}
}

variable "instance_type" {
  description = "EC2 instance type for the auto-scaled instances."
  type        = string
  default     = "t3.small"
}

variable "asg_min_size" {
  description = "Minimum instances."
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Maximum instances."
  type        = number
  default     = 4
}

variable "health_check_path" {
  description = "HTTP path the load balancer uses for target health."
  type        = string
  default     = "/health"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for instance logs streamed by EB."
  type        = number
  default     = 30
}
