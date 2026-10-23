variable "name" {
  description = "Name prefix for every network resource."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR. Public subnets use the first /28s, private subnets offset by 8."
  type        = string
  default     = "10.20.0.0/16"
}

variable "nat_gateways" {
  description = "Number of NAT gateways. Use 2 in prod for AZ resilience, 1 in dev to save cost."
  type        = number
  default     = 1

  validation {
    condition     = var.nat_gateways >= 1 && var.nat_gateways <= 2
    error_message = "nat_gateways must be 1 or 2 (the module builds two availability zones)."
  }
}

variable "enable_flow_logs" {
  description = "Ship VPC flow logs to CloudWatch."
  type        = bool
  default     = true
}

variable "flow_log_retention_days" {
  description = "Retention for VPC flow logs."
  type        = number
  default     = 30
}
