# OpenSearch domain for server-side full-text search, attached to the private
# subnets with fine-grained access control (spec §9: least privilege, encrypted
# at rest, auditable).
#
# The API signs in with the generated master credentials (OPENSEARCH_USERNAME /
# OPENSEARCH_PASSWORD). The domain never has a public endpoint: only the
# Elastic Beanstalk security group may reach it, over HTTPS only.
#
# A VPC-attached domain requires the service-linked role
# AWSServiceRoleForAmazonOpenSearchService. AWS creates it the first time an
# OpenSearch domain is created through the console; in a fresh account apply
# this module with create_service_linked_role = true once (see docs/infra.md).

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

locals {
  master_username = "holyword"
}

resource "random_password" "master" {
  length  = 32
  upper   = true
  lower   = true
  numeric = true
  # Sent as an HTTP basic-auth header, so URL-safe characters keep it simple to
  # paste into other tooling without escaping.
  special = false
}

resource "aws_iam_service_linked_role" "opensearch" {
  count = var.create_service_linked_role ? 1 : 0

  aws_service_name = "opensearch.amazonaws.com"
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-opensearch-"
  description = "OpenSearch access for the HolyWord API tier"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name}-opensearch"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "ingress" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  description              = "HTTPS from application tier ${var.allowed_security_group_ids[count.index]}"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_ids[count.index]
  security_group_id        = aws_security_group.this.id
}

resource "aws_security_group_rule" "egress" {
  type              = "egress"
  description       = "All outbound traffic"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.this.id
}

resource "aws_opensearch_domain" "this" {
  domain_name    = var.domain_name
  engine_version = var.engine_version

  cluster_config {
    instance_type          = var.instance_type
    instance_count         = var.instance_count
    zone_awareness_enabled = var.instance_count > 1
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.ebs_volume_size
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  # Fine-grained access control: anonymous access is refused, every request must
  # authenticate with IAM or the internal-user credentials the API uses.
  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true

    master_user_options {
      master_user_name     = local.master_username
      master_user_password = random_password.master.result
    }
  }

  vpc_options {
    subnet_ids         = slice(var.private_subnet_ids, 0, var.instance_count > 1 ? 2 : 1)
    security_group_ids = [aws_security_group.this.id]
  }

  tags = {
    Name = "${var.name}-search"
  }

  depends_on = [aws_iam_service_linked_role.opensearch]
}
