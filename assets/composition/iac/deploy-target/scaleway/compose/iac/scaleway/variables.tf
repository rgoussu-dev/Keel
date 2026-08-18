variable "instance_type" {
  description = "Scaleway instance type."
  type        = string
  default     = "DEV1-S"
}

variable "service_port" {
  description = "Host port the compose descriptor publishes (its PORT knob, default 8080)."
  type        = number
  default     = 8080
}
