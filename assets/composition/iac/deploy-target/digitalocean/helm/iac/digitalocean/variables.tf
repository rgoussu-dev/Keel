variable "region" {
  description = "DigitalOcean region for the cluster."
  type        = string
  default     = "ams3"
}

variable "node_size" {
  description = "Droplet size slug for the default node pool."
  type        = string
  default     = "s-2vcpu-2gb"
}

variable "node_count" {
  description = "Number of nodes in the default pool."
  type        = number
  default     = 2
}
