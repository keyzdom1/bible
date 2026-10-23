# RDS PostgreSQL for user data. Bible text never lives here (ADR 0002).
#
# The master password is generated URL-safe and stored as JSON in Secrets Manager.
# The module exposes the assembled DATABASE_URL as a sensitive output so the
# Elastic Beanstalk environment can receive it without secrets in any file.

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
  username = "holyword"
  dbname   = "holyword"
}

resource "random_password" "master" {
  length  = 32
  upper   = true
  lower   = true
  numeric = true
  # URL-safe only: the password is embedded in DATABASE_URL.
  special = false
}

resource "aws_secretsmanager_secret" "database" {
  name_prefix = "${var.name}-database-"
  description = "HolyWord ${var.name} RDS master credentials"

  tags = {
    Name = "${var.name}-database"
  }
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    username = local.username
    password = random_password.master.result
    engine   = "postgres"
    host     = aws_db_instance.this.address
    port     = aws_db_instance.this.port
    dbname   = local.dbname
  })
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name}-db"
  }
}

resource "aws_security_group" "database" {
  name_prefix = "${var.name}-db-"
  description = "PostgreSQL access for the HolyWord API tier"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name}-db"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "ingress" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  description              = "PostgreSQL from application tier ${var.allowed_security_group_ids[count.index]}"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_group_ids[count.index]
  security_group_id        = aws_security_group.database.id
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_encrypted     = true

  db_name  = local.dbname
  username = local.username
  password = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false

  backup_retention_period   = var.backup_retention_period
  backup_window             = var.backup_window
  maintenance_window        = var.maintenance_window
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${var.name}-postgres-final" : null

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  tags = {
    Name = "${var.name}-postgres"
  }
}
