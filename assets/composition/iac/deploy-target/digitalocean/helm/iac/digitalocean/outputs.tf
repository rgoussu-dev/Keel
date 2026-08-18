output "cluster_name" {
  description = "Cluster name, for `doctl kubernetes cluster kubeconfig save`."
  value       = digitalocean_kubernetes_cluster.cluster.name
}
