output "cluster_id" {
  description = "Cluster id, for `scw k8s kubeconfig install`."
  value       = scaleway_k8s_cluster.cluster.id
}
