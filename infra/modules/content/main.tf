# Private content storage plus the CloudFront distribution the API signs URLs
# against (CONTENT_DELIVERY_MODE=cloudfront). The bucket is never public: only the
# origin access control may read it, and object URLs require a signed policy.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

resource "aws_s3_bucket" "packages" {
  bucket = var.bucket_name

  tags = {
    Name = var.bucket_name
    Role = "holyword-content-packages"
  }
}

resource "aws_s3_bucket_versioning" "packages" {
  bucket = aws_s3_bucket.packages.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "packages" {
  bucket = aws_s3_bucket.packages.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "packages" {
  bucket                  = aws_s3_bucket.packages.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Objects are immutable (ADR 0002): expire noncurrent versions so republished
# packages do not accumulate forever, but never expire current ones.
resource "aws_s3_bucket_lifecycle_configuration" "packages" {
  bucket = aws_s3_bucket.packages.id

  rule {
    id     = "noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_cloudfront_origin_access_control" "packages" {
  name                              = "${var.name}-packages-oac"
  description                       = "Only this distribution may read ${aws_s3_bucket.packages.id}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Public half of the CloudFront key pair the API uses to sign package URLs.
# The private half stays with the API at runtime (CLOUDFRONT_PRIVATE_KEY_PATH)
# and is never written to Terraform state.
resource "aws_cloudfront_public_key" "packages" {
  comment     = "${var.name} package URL signing"
  encoded_key = var.signing_public_key_pem
  name        = "${var.name}-package-signing"
}

data "aws_iam_policy_document" "packages" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.packages.arn, "${aws_s3_bucket.packages.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.packages.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.packages.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "packages" {
  bucket = aws_s3_bucket.packages.id
  policy = data.aws_iam_policy_document.packages.json
}

locals {
  cache_behavior = {
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "packages"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    trusted_signers          = ["self"]
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # AllViewer: keeps Range/If-Range for resume
  }
}

resource "aws_cloudfront_distribution" "packages" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name} signed Bible package delivery"
  price_class         = var.price_class
  http_version        = "http2and3"
  default_root_object = ""

  origin {
    domain_name              = aws_s3_bucket.packages.bucket_regional_domain_name
    origin_id                = local.cache_behavior.target_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.packages.id
  }

  default_cache_behavior {
    allowed_methods            = local.cache_behavior.allowed_methods
    cached_methods             = local.cache_behavior.cached_methods
    target_origin_id           = local.cache_behavior.target_origin_id
    viewer_protocol_policy     = local.cache_behavior.viewer_protocol_policy
    compress                   = local.cache_behavior.compress
    trusted_signers            = local.cache_behavior.trusted_signers
    cache_policy_id            = local.cache_behavior.cache_policy_id
    origin_request_policy_id   = local.cache_behavior.origin_request_policy_id
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy
  }

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
    Name = "${var.name}-packages"
  }
}
