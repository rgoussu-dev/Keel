variable "node_type" {
  description = "Scaleway instance type for the default node pool."
  type        = string
  default     = "DEV1-M"
}

variable "node_count" {
  description = "Number of nodes in the default pool."
  type        = number
  default     = 2
}
