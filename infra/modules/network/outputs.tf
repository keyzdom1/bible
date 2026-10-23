output "vpc_id" {
  description = "VPC for Elastic Beanstalk, RDS and OpenSearch."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnets for the Elastic Beanstalk load balancer and instances."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnets for RDS and OpenSearch."
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ids" {
  description = "NAT gateways used by private subnets."
  value       = aws_nat_gateway.this[*].id
}
