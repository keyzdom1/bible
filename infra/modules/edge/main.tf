# Public edge: one CloudFront distribution in front of both Elastic Beanstalk
# environments (spec §11: User → CloudFront/WAF → Load Balancer → Backend API),
# protected by AWS managed WAF rules.
#
# The WAF web ACL for a CloudFront distribution must be created in us-east-1, so
# the calling environment passes an aliased provider via configuration_aliases.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.60"
      configuration_aliases = [aws.east]
    }
  }
}

locals {
  web_cache_policy   = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled (Next.js SSR)
  api_request_policy = "216adef6-5c7f-47e4-b989-5492eafa07d3" # AllViewer: cookies + Authorization
  web_request_policy = "59781a5b-3903-41f3-afcb-af62929ccde1" # AllViewerAndHostHeaders: correct Host for Next.js
}

resource "aws_wafv2_web_acl" "this" {
  provider = aws.east

  name        = "${var.name}-edge"
  description = "Managed rule groups for the HolyWord public edge"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-managed-common"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-managed-known-bad-inputs"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-managed-sqli"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "per-ip-rate-limit"
    priority = 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_ip
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-edge"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${var.name}-edge"
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name} application edge (web + API)"
  price_class     = var.price_class
  http_version    = "http2and3"

  origin {
    domain_name = var.web_origin_domain
    origin_id   = "web"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name = var.api_origin_domain
    origin_id   = "api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Health endpoint routed to the API so operators and the deploy smoke test can
  # probe the full CloudFront -> EB -> API path.
  ordered_cache_behavior {
    path_pattern           = "/health*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = local.web_cache_policy
    origin_request_policy_id = local.api_request_policy
  }

  # API traffic never caches and always forwards session cookies and bearer tokens.
  ordered_cache_behavior {
    path_pattern           = "/v1*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = local.web_cache_policy
    origin_request_policy_id   = local.api_request_policy
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy
  }

  # The PWA is server-rendered: pass through and let the app shell cache work.
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = local.web_cache_policy
    origin_request_policy_id   = local.web_request_policy
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy
  }

  web_acl_id = aws_wafv2_web_acl.this.arn

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Name = "${var.name}-app"
  }
}
