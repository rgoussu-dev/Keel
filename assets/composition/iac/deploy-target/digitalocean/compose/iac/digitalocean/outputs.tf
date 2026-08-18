output "ipv4" {
  description = "Public address of the Docker host; the deploy loop targets ssh://root@<ipv4>."
  value       = digitalocean_droplet.host.ipv4_address
}
