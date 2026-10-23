# GitHub Actions OIDC: no long-lived AWS keys in CI (spec §9).
#
# Two roles are created:
#   - terraform: runs `terraform plan/apply` from CI (workflow_dispatch).
#   - deploy:    uploads application bundles to S3 and drives Elastic Beanstalk
#                (used by .github/workflows/deploy.yml).
#
# Both trust only this repository on this branch plus the named GitHub
# environments, so a fork or another branch cannot assume them.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  account_id        = data.aws_caller_identity.current.account_id
  oidc_provider_arn = "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
  ref_sub           = "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"

  # GitHub environment jobs present "repo:OWNER/REPO:environment:NAME" as the
  # subject instead of the branch ref.
  deploy_subjects = concat(
    [local.ref_sub],
    [for environment in var.github_environments : "repo:${var.github_repository}:environment:${environment}"],
  )
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # AWS no longer validates this thumbprint for the GitHub provider; the field is
  # required by the API, so it stays a variable with the historical default.
  thumbprint_list = [var.github_oidc_thumbprint]
}

# ---------------------------------------------------------------------------
# Terraform (plan/apply)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "terraform" {
  name_prefix = "${var.name}-terraform-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = local.ref_sub
          }
        }
      },
    ]
  })
}

data "aws_iam_policy_document" "terraform" {
  statement {
    sid = "ManageStackServices"
    actions = [
      "autoscaling:*",
      "cloudfront:*",
      "cloudwatch:*",
      "cognito-idp:*",
      "dynamodb:*",
      "ec2:*",
      "elasticbeanstalk:*",
      "elasticloadbalancing:*",
      "es:*",
      "kms:*",
      "logs:*",
      "rds:*",
      "s3:*",
      "secretsmanager:*",
      "sns:*",
      "wafv2:*",
    ]
    resources = ["*"]
  }

  # IAM itself is the security-critical service, so only the primitives this
  # stack needs are allowed (roles, policies, instance profiles, the OIDC
  # provider and the OpenSearch service-linked role).
  statement {
    sid = "ManageIamPrimitives"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreateInstanceProfile",
      "iam:CreateOpenIDConnectProvider",
      "iam:CreatePolicy",
      "iam:CreateRole",
      "iam:CreateServiceLinkedRole",
      "iam:DeleteInstanceProfile",
      "iam:DeleteOpenIDConnectProvider",
      "iam:DeletePolicy",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DeleteServiceLinkedRole",
      "iam:DetachRolePolicy",
      "iam:GetInstanceProfile",
      "iam:GetOpenIDConnectProvider",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListOpenIDConnectProviders",
      "iam:ListRolePolicies",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:TagOpenIDConnectProvider",
      "iam:TagRole",
      "iam:UntagOpenIDConnectProvider",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ReadIdentity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "terraform" {
  name   = "${var.name}-terraform"
  role   = aws_iam_role.terraform.id
  policy = data.aws_iam_policy_document.terraform.json
}

# ---------------------------------------------------------------------------
# Application deploys (bundle upload + Elastic Beanstalk version swap)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "deploy" {
  name_prefix = "${var.name}-deploy-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = local.deploy_subjects
          }
        }
      },
    ]
  })
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid = "ApplicationBundles"
    actions = [
      "elasticbeanstalk:CreateApplicationVersion",
      "elasticbeanstalk:DescribeApplicationVersions",
      "elasticbeanstalk:DescribeApplications",
      "elasticbeanstalk:DescribeEnvironments",
      "elasticbeanstalk:UpdateEnvironment",
    ]
    resources = ["arn:aws:elasticbeanstalk:*:${local.account_id}:*"]
  }

  statement {
    sid = "ArtifactBucket"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
    ]
    resources = ["${var.artifact_bucket_arn}/*"]
  }

  statement {
    sid       = "ListArtifactBucket"
    actions   = ["s3:ListBucket"]
    resources = [var.artifact_bucket_arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.name}-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
