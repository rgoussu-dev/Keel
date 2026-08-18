variable "region" {
  description = "DigitalOcean region for the host."
  type        = string
  default     = "ams3"
}

variable "size" {
  description = "Droplet size slug."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "ssh_key_name" {
  description = "Name of an SSH key already uploaded to the DigitalOcean team; the deploy loop reaches Docker over SSH."
  type        = string
}

variable "service_port" {
  description = "Host port the compose descriptor publishes (its PORT knob, default 8080)."
  type        = number
  default     = 8080
}
