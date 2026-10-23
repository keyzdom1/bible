# Elastic Beanstalk Node.js environment (spec §3: plain Node app, no Docker).
#
# Terraform owns the application, environment, IAM roles and security group.
# Application versions are uploaded and swapped by CI (scripts/build-bundle.mjs
# plus .github/workflows/deploy.yml), so no version_label is set here.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

data "aws_elastic_beanstalk_solution_stack" "nodejs" {
  most_recent = true
  name_regex  = "64bit Amazon Linux 2023 v\\d+\\.\\d+\\.\\d+ running Node\\.js 22"
}

locals {
  base_settings = [
    {
      namespace = "aws:elasticbeanstalk:environment"
      name      = "EnvironmentType"
      value     = "LoadBalanced"
    },
    {
      namespace = "aws:elasticbeanstalk:environment"
      name      = "LoadBalancerType"
      value     = "application"
    },
    {
      namespace = "aws:elasticbeanstalk:environment"
      name      = "ServiceRole"
      value     = aws_iam_role.service.arn
    },
    {
      namespace = "aws:elasticbeanstalk:environment:process:default"
      name      = "HealthCheckPath"
      value     = var.health_check_path
    },
    {
      namespace = "aws:elasticbeanstalk:environment:process:default"
      name      = "Matcher"
      value     = "200"
    },
    {
      namespace = "aws:elasticbeanstalk:environment:process:default"
      name      = "Port"
      value     = "80"
    },
    {
      namespace = "aws:elasticbeanstalk:environment:process:default"
      name      = "Protocol"
      value     = "HTTP"
    },
    {
      namespace = "aws:elasticbeanstalk:environment:loadbalancer"
      name      = "CrossLoadBalancing"
      value     = "enabled"
    },
    {
      namespace = "aws:elasticbeanstalk:environment:loadbalancer"
      name      = "IdleTimeout"
      value     = "60"
    },
    {
      namespace = "aws:elasticbeanstalk:healthreporting:system"
      name      = "SystemType"
      value     = "enhanced"
    },
    {
      namespace = "aws:elasticbeanstalk:cloudwatch:logs"
      name      = "StreamLogs"
      value     = "true"
    },
    {
      namespace = "aws:elasticbeanstalk:cloudwatch:logs"
      name      = "DeleteLogsOnTerminate"
      value     = "false"
    },
    {
      namespace = "aws:elasticbeanstalk:cloudwatch:logs"
      name      = "RetentionDays"
      value     = tostring(var.log_retention_days)
    },
    {
      namespace = "aws:elasticbeanstalk:cloudwatch:default"
      name      = "EnableCloudWatch"
      value     = "true"
    },
    {
      namespace = "aws:elasticbeanstalk:managedactions"
      name      = "ManagedActionsEnabled"
      value     = "true"
    },
    {
      namespace = "aws:elasticbeanstalk:managedactions:platformupdate"
      name      = "UpdateLevel"
      value     = "minor"
    },
    {
      namespace = "aws:elasticbeanstalk:command"
      name      = "DeploymentPolicy"
      value     = "Rolling"
    },
    {
      namespace = "aws:elasticbeanstalk:command"
      name      = "IgnoreHealthCheck"
      value     = "false"
    },
    {
      namespace = "aws:autoscaling:launchconfiguration"
      name      = "IamInstanceProfile"
      value     = aws_iam_instance_profile.this.name
    },
    {
      namespace = "aws:autoscaling:launchconfiguration"
      name      = "InstanceType"
      value     = var.instance_type
    },
    {
      namespace = "aws:autoscaling:asg"
      name      = "MinSize"
      value     = tostring(var.asg_min_size)
    },
    {
      namespace = "aws:autoscaling:asg"
      name      = "MaxSize"
      value     = tostring(var.asg_max_size)
    },
    {
      namespace = "aws:autoscaling:asg"
      name      = "EnableMetrics"
      value     = "true"
    },
    {
      namespace = "aws:ec2:vpc"
      name      = "VPCId"
      value     = var.vpc_id
    },
    {
      namespace = "aws:ec2:vpc"
      name      = "Subnets"
      value     = join(",", var.public_subnet_ids)
    },
    {
      namespace = "aws:ec2:vpc"
      name      = "ELBSubnets"
      value     = join(",", var.public_subnet_ids)
    },
  ]

  environment_settings = [
    for key, value in var.environment_variables : {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = key
      value     = value
    }
  ]

  settings = concat(local.base_settings, local.environment_settings)
}

resource "aws_elastic_beanstalk_application" "this" {
  name        = var.application_name
  description = var.application_description

  tags = {
    Name = var.application_name
  }
}

resource "aws_iam_role" "service" {
  name_prefix = "${var.name}-eb-service-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "elasticbeanstalk.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "service" {
  role       = aws_iam_role.service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService"
}

resource "aws_iam_role_policy_attachment" "service_health" {
  role       = aws_iam_role.service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
}

resource "aws_iam_role" "instance" {
  name_prefix = "${var.name}-eb-instance-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "web_tier" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_role_policy_attachment" "worker_tier" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorker"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "this" {
  name_prefix = "${var.name}-eb-"
  role        = aws_iam_role.instance.name
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-eb-"
  description = "Elastic Beanstalk ${var.name} instances, reached through the application load balancer"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name}-eb"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "http_from_load_balancer" {
  type              = "ingress"
  description       = "HTTP from the Elastic Beanstalk load balancer"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = [var.vpc_cidr_block]
  security_group_id = aws_security_group.this.id
}

resource "aws_security_group_rule" "egress_all" {
  type              = "egress"
  description       = "All outbound traffic"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.this.id
}

resource "aws_elastic_beanstalk_environment" "this" {
  name                   = var.name
  application            = aws_elastic_beanstalk_application.this.name
  solution_stack_name    = data.aws_elastic_beanstalk_solution_stack.nodejs.name
  tier                   = "WebServer"
  wait_for_ready_timeout = "20m"

  dynamic "setting" {
    for_each = local.settings

    content {
      namespace = setting.value.namespace
      name      = setting.value.name
      value     = setting.value.value
    }
  }

  tags = {
    Name        = var.name
    Environment = var.name
  }
}
