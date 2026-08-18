output "ipv4" {
  description = "Public address of the Docker host; the deploy loop targets ssh://root@<ipv4>."
  value       = scaleway_instance_ip.host.address
}
