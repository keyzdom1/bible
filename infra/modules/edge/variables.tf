variable "name" {
  description = "Name prefix for the edge resources."
  type        = string
}

variable "web_origin_domain" {
  description = "Web Elastic Beanstalk CNAME (no protocol)."
  type        = string
}

variable "api_origin_domain" {
  description = "API Elastic Beanstalk CNAME (no protocol)."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

variable "rate_limit_per_ip" {
  description = "Requests per 5 minutes per IP before WAF blocks the client."
  type        = number
  default     = 3000
}
