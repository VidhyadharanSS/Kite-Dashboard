#!/usr/bin/env bash
set -x
# Reference: https://internals.csez.zohocorpin.com/zcp/help/developer/component_management/custom_component.html

ACTION=$1
MACHINE_IP=$2
ZAC_INVENTORY_GROUP=$3

PROPERTIES_FILE="/home/sas/kites-worker.properties"

KUBELET_VERSION="v1.27.4"
KUBEADM_VERSION="v1.27.4"
KUBECTL_VERSION="v1.27.4"
CRICTL_VERSION="v1.27.1"
CONTAINERD_VERSION="v1.7.2"
CONNTRACK_VERSION="v1.4.6"
EBTABLES_VERSION="1.8.7"
SOCAT_VERSION="1.7.4.1"
KUBERNETES_VERSION="v1.27.4"
ETCD_VERSION="3.5.7-0"
PAUSE_VERSION="3.9"
COREDNS_VERSION="v1.10.1"
FLANNEL_VERSION="v0.22.1"
FLANNEL_CNI_PLUGIN_VERSION="v1.2.0"
METRICS_SERVER_VERSION="v0.6.2"
INGRESS_NGINX_VERSION="v1.8.1"


USER=$(whoami)
USER_HOME=/home/${USER}

SERVICE_NAME="ZohoCRM"

APP_GRID_URL=$(grep '^app_grid_url=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
STRATUS_URL=$(grep '^stratus_url=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
PARALLEL_WORKERS=$(grep '^max_parallel_workers=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
ISC_PRIVATE_KEY=$(grep '^isc_private_key=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
DEFAULT_NAMESPACE=$(grep '^default_namespace=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
SECONDARY_NAMESPACES=$(grep '^secondary_namespaces=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
DEFAULT_NAMESPACE=${DEFAULT_NAMESPACE:-crmintelligencepy-default}
BASE_DIR="/home/sas/volumes/$DEFAULT_NAMESPACE"
PARALLEL_WORKERS="${PARALLEL_WORKERS:-4}"
KITES_PROXY_IP=$(grep '^target_internal_ip=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
DC=$(grep '^dc=' "$PROPERTIES_FILE" |cut -d'=' -f2-)
KITES_PROXY_URL="http://kites:${DC}kites-8090@${KITES_PROXY_IP}:8090"
STRATUS_BACKUP_REQUIRED=true
if grep -q '^stratus_backup_required=' "$PROPERTIES_FILE"; then
  STRATUS_BACKUP_REQUIRED=$(grep '^stratus_backup_required=' "$PROPERTIES_FILE" | cut -d'=' -f2-)
fi
if [[ "$ACTION" != "label_node_tier" && "$ACTION" != "health" ]]; then
    for var in APP_GRID_URL STRATUS_URL ISC_PRIVATE_KEY; do
      [[ -z "${!var}" ]] && {
        echo "Missing required config: $var" >&2
        exit 1
      }
    done
fi

[[ "$PARALLEL_WORKERS" =~ ^[1-9][0-9]*$ ]] || {
  echo "MAX_PARALLEL_WORKERS must be a positive integer" >&2
  exit 1
}



check_system_configuration() {
    status=0

    # Check if swap is disabled
    swap_status=$(swapon --show)
    if [ -n "$swap_status" ]; then
        status=1
        log "Error! Swap is enabled. Please disable swap."
    else
        log "Swap is disabled"
    fi

    # Check if necessary cgroups are enabled in grub
    necessary_cgroups=("cpu" "cpuacct" "cpuset" "memory" "devices" "freezer" "net_cls" "net_prio" "blkio" "pids")
    for cgroup in "${necessary_cgroups[@]}"; do
        enabled=$(awk -v cgroup="$cgroup" '$1==cgroup && $4=="1" {print "enabled"}' /proc/cgroups)
        if [ -z "$enabled" ]; then
            status=1
            log "Error! Cgroup $cgroup is NOT enabled. Please enable it."
        else
            log "Cgroup $cgroup is enabled"
        fi
    done

    # Check if necessary iptables configurations are present
    declare -A settings
    settings=(
        ["net.bridge.bridge-nf-call-ip6tables"]="1"
        ["net.bridge.bridge-nf-call-iptables"]="1"
        ["net.ipv4.ip_forward"]="1"
    )
    for setting in "${!settings[@]}"; do
        current_value=$(sysctl -n "$setting" 2>/dev/null)
        if [[ $? -ne 0 || $current_value != ${settings[$setting]} ]]; then
            status=1
            log "Error! '$setting = ${settings[$setting]}' iptable rule is missing."
        else
            log "'$setting = ${settings[$setting]}' iptable rule is available"
        fi
    done

    # Check if SELinux is disabled
    if command -v sestatus >/dev/null 2>&1; then
        selinux_status=$(sestatus | grep "SELinux status" | awk '{print $NF}')
        if [ "$selinux_status" != "disabled" ]; then
            status=1
            log "Error! SELinux is enabled. Please disable it."
        else
            log "SELinux is disabled"
        fi
    else
        log "'sestatus' binary NOT available"
    fi

    # Check if necessary kernel modules are loaded
    required_modules=("br_netfilter" "overlay" "ip_tables")
    # Kernel modules 'nf_nat' and 'xt_conntrack' are temporarily excluded.
    # Include them if necessary.
    for module in "${required_modules[@]}"; do
        if ! lsmod | grep -q "$module"; then
            status=1
            log "Error! Kernel module $module is NOT loaded. Please load it."
        else
            log "Kernel module $module is loaded"
        fi
    done

    # Check if Kubernetes ports are added to the firewall.
    ports=("6443" "2379:2380" "10250" "10259" "10257" "30000:32767")
    firewall_status=$(systemctl is-active ufw 2>/dev/null)
    if [ "$firewall_status" == "active" ] && ufw status | grep -qx "Status: active"; then
        for port in "${ports[@]}"; do
            if ! ufw status | grep -q "$port/tcp"; then
                status=1
                log "Error! Port $port is NOT open. Please add the port to firewall."
            else
                log "Port $port is open"
            fi
        done
    else
        log "Firewall daemon is NOT active"
    fi

    # Check if max user process limit is increased
    if [ "$(ulimit -u)" -eq 200000 ]; then
        log "Max user process limit is 200000"
    else
        status=1
        log "Error! Max user process limit is $(ulimit -u), but expected 200000."
    fi

    if [ $status -ne 0 ]; then
        log "Error! System configuration is NOT suitable for a Kubernetes cluster."
        return 1
    else
        log "System configuration is suitable for a Kubernetes cluster"
        return 0
    fi

}

check_binaries_version() {
    status=0

    # Check kubelet
    if which kubelet &>/dev/null; then
        version=$(kubelet --version | cut -d' ' -f2)
        if [ "$version" != "$KUBELET_VERSION" ]; then
            status=1
            log "Error! kubelet version is $version, but expected $KUBELET_VERSION ."
        else
            log "kubelet $version is available"
        fi
    else
        status=1
        log "Error! kubelet is NOT available."
    fi

    # Check kubeadm
    if which kubeadm &>/dev/null; then
        version=$(kubeadm version -o short | cut -d' ' -f3)
        if [ "$version" != "$KUBEADM_VERSION" ]; then
            status=1
            log "Error! kubeadm version is $version, but expected $KUBEADM_VERSION ."
        else
            log "kubeadm $version is available"
        fi
    else
        status=1
        log "Error! kubeadm is NOT available."
    fi

    # Check kubectl
    if which kubectl &>/dev/null; then
        version=$(kubectl version --short 2>/dev/null | grep "Client Version" | awk '{print $3}')
        if [ "$version" != "$KUBECTL_VERSION" ]; then
            status=1
            log "Error! kubectl version is $version, but expected $KUBECTL_VERSION ."
        else
            log "kubectl $version is available"
        fi
    else
        status=1
        log "Error! kubectl is NOT available."
    fi

    # Check cni-plugins
    dir="/opt/cni/bin"
    binaries=("bandwidth" "bridge" "dhcp" "dummy" "firewall" "host-device" "host-local" "ipvlan" "loopback" "macvlan" "portmap" "ptp" "sbr" "static" "tap" "tuning" "vlan" "vrf")
    missing_binaries=""
    if [ ! -d "$dir" ]; then
        status=1
        log "Error! CNI plugins are NOT available. '/opt/cni/bin' directory does NOT exist."
    fi
    for binary in "${binaries[@]}"; do
        if [ ! -f "$dir/$binary" ]; then
            missing_binaries+="$binary "
        fi
    done
    if [ -n "$missing_binaries" ]; then
        status=1
        log "Error! CNI plugins are NOT available. Missing binaries: $missing_binaries."
    fi

    # Check crictl
    if which crictl &>/dev/null; then
        version=$(crictl --version | cut -d' ' -f3)
        if [ "$version" != "$CRICTL_VERSION" ]; then
            status=1
            log "Error! crictl version is $version, but expected $CRICTL_VERSION ."
        else
            log "crictl $version is available"
        fi
    else
        status=1
        log "Error! crictl is NOT available."
    fi

    # Check containerd
    if which containerd &>/dev/null; then
        version=$(containerd --version | awk '{print $3}')
        if [ "$version" != "$CONTAINERD_VERSION" ]; then
            status=1
            log "Error! containerd version is $version, but expected $CONTAINERD_VERSION ."
        else
            log "containerd $version is available"
        fi
    else
        status=1
        log "Error! containerd is NOT available"
    fi

    # For the below binaries (conntrack, ebtables, socat) throw an error only if
    # the binaries are NOT installed. If version mismatch is found, throw a
    # warning in the logger and continue.

    # Check conntrack
    if which conntrack &>/dev/null; then
        version=$(conntrack -V | head -n 1 | awk '{print $2}')
        if [ "$version" != "$CONNTRACK_VERSION" ]; then
            log "Warning! conntrack version is $version, but expected $CONNTRACK_VERSION ."
        else
            log "conntrack $version is available"
        fi
    else
        status=1
        log "Error! conntrack is NOT available."
    fi

    # Check ebtables
    if which ebtables &>/dev/null; then
        version=$(ebtables --version | head -n 1 | cut -d' ' -f2)
        if [ "$version" != "$EBTABLES_VERSION" ]; then
            log "Warning! ebtables version is $version, but expected $EBTABLES_VERSION ."
        else
            log "ebtables $version is available"
        fi
    else
        status=1
        log "Error! ebtables is NOT available."
    fi

    # Check socat
    if which socat &>/dev/null; then
        version=$(socat -V | grep "socat version" | awk '{print $3}')
        if [ "$version" != "$SOCAT_VERSION" ]; then
            log "Warning! socat version is $version, but expected $SOCAT_VERSION ."
        else
            log "socat $version is available"
        fi
    else
        status=1
        log "Error! socat is NOT installed."
    fi

    if [ $status -ne 0 ]; then
        log "Error! Required binary(s) is missing or version mismatch is found."
        return 1
    else
        log "Required binaries are available"
        return 0
    fi
}

check_binaries_configuration() {
    status=0

    # Check if services are registered with systemd
    services=("containerd" "kubelet")
    for service in "${services[@]}"; do
        if ! systemctl list-units --full -all | grep -Fq "$service.service"; then
            status=1
            log "Error! $service is either NOT registered with systemd or enabled properly."
        fi
    done

    # Check containerd configurations
    config_dump=$(containerd config dump)
    configurations=(
        "version = 2"
        "root = \"/home/sas/containerd/data\""
        "config_path = \"/home/sas/containerd/certs.d\""
        "runtime_type = \"io.containerd.runc.v2\""
        "SystemdCgroup = true"
        "sandbox_image = \"registry.k8s.io/pause:3.9\""
    )
    for config in "${configurations[@]}"; do
        if ! echo "$config_dump" | grep -q "$config"; then
            status=1
            log "Error! Configuration '$config' is missing."
        fi
    done

    # Check sudo access for binaries
    binaries=("kubeadm" "kubelet" "kubectl" "containerd" "crictl" "ctr")
    for binary in "${binaries[@]}"; do
        if ! sudo -l | grep -q "$binary"; then
            status=1
            log "Error! User does NOT have sudo access for $binary."
        fi
    done
    services=("kubelet" "containerd")
    commands=("status" "restart" "start" "stop")
    for cmd in "${commands[@]}"; do
        for service in "${services[@]}"; do
            if ! sudo -l | grep -q "systemctl $cmd $service"; then
                status=1
                log "Error! User does NOT have sudo access for 'systemctl $cmd $service'."
            fi
        done
    done

    if [ $status -ne 0 ]; then
        log "Error! Required configuration of binary(s) is NOT available"
        return 1
    else
        log "Required configuration of binaries are available"
        return 0
    fi
}

load_cluster_images() {
    status=0

    # Check if cluster images tarball is present
    if [ ! -f "/home/sas/cluster-images.tar" ]; then
        log "Warning! cluster-images.tar is NOT found at \"/home/sas\" directory."
    fi

    # Check if images are loaded
    images=(
        "registry.k8s.io/kube-apiserver:$KUBERNETES_VERSION"
        "registry.k8s.io/kube-controller-manager:$KUBERNETES_VERSION"
        "registry.k8s.io/kube-scheduler:$KUBERNETES_VERSION"
        "registry.k8s.io/etcd:$ETCD_VERSION"
        "registry.k8s.io/coredns/coredns:$COREDNS_VERSION"
        "registry.k8s.io/kube-proxy:$KUBERNETES_VERSION"
        "registry.k8s.io/pause:$PAUSE_VERSION"
        "docker.io/flannel/flannel-cni-plugin:$FLANNEL_CNI_PLUGIN_VERSION"
        "docker.io/flannel/flannel:$FLANNEL_VERSION"
        "registry.k8s.io/ingress-nginx/controller:$INGRESS_NGINX_VERSION"
        "registry.k8s.io/ingress-nginx/kube-webhook-certgen:v20230407"
        "k8s.gcr.io/metrics-server/metrics-server:$METRICS_SERVER_VERSION"
    )
    for image in "${images[@]}"; do
        pattern=$(echo "$image" | sed 's/:\(.*\)$/[ \t]*\1/')
        if ! sudo crictl images | grep -qE "$pattern"; then
            status=1
            log "Warning! $image is NOT available."
        fi
    done

    # Load missing images
    if [ $status -ne 0 ]; then
        if sudo ctr -n k8s.io images import /home/sas/cluster-images.tar; then
            log "Loaded cluster images from tarball"
            return 0
        else
            log "Error! Unable to load cluster images from tarball."
            return 1
        fi
    else
        log "Cluster images are available locally"
        return 0
    fi
}

precheck() {
    check_system_configuration
    status=$?
    check_binaries_version
    ((status += $?))
    check_binaries_configuration
    ((status += $?))
    load_cluster_images
    ((status += $?))
    return $status
}

build_kubeadm_configuration() {
    if [ ! -f "$PROPERTIES_FILE" ]; then
        log "Error! $PROPERTIES_FILE does not exist. Unable to build kubeadm configuration file"
        return 1
    fi
    master_ip=$(grep "master_ip" $PROPERTIES_FILE | cut -d '=' -f 2-)
    ca_cert_hash=$(grep "ca_cert_hash" $PROPERTIES_FILE | cut -d '=' -f 2-)
    token=$(grep "token" $PROPERTIES_FILE | cut -d '=' -f 2-)
    cat <<EOF >/home/sas/kubeadm.conf
apiVersion: kubeadm.k8s.io/v1beta3
discovery:
  bootstrapToken:
    apiServerEndpoint: $master_ip:6443
    caCertHashes:
    - $ca_cert_hash
    token: $token
  timeout: 3m0s
kind: JoinConfiguration
EOF
}

kubeadm_join() {
    sudo kubeadm --config /home/sas/kubeadm.conf --v=4 join 2>&1 | tee /home/sas/kubeadm.log
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        log "Error! kubeadm join failed. Check '/home/sas/kubeadm.log' for more details."
        print_kubeadm_log
        return 1
    else
        log "kubeadm join executed successfully"
        return 0
    fi
}

install_component() {
    kubeadm_reset
    build_kubeadm_configuration
    if [ $? -ne 0 ]; then
        return 1
    fi
    kubeadm_join
    if [ $? -ne 0 ]; then
        return 1
    fi
    return 0
}

kubeadm_reset() {
    sudo kubeadm reset --force --v=4 2>&1 | tee /home/sas/kubeadm.log
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        log "Error! kubeadm reset failed. Check '/home/sas/kubeadm.log' for more details."
        print_kubeadm_log
        return 1
    else
        log "kubeadm reset executed successfully"
        return 0
    fi
}

remove_config_files() {
    rm -f /home/sas/kubeadm.conf
    return 0
}

prune_containers() {
    # Warning! This method will force kill containers belonging to all namespaces
    for ns in $(sudo ctr namespace list -q); do
        sudo ctr -n $ns task ls -q | xargs -I {} sudo ctr -n $ns task kill --signal SIGKILL {}
        sudo ctr -n $ns container list -q | xargs -I {} sudo ctr -n $ns container rm {}
    done
    return 0
}

prune_unused_images() {
    status=0

    if which crictl &>/dev/null; then
        if stderr=$(sudo crictl rmi --prune 2>&1); then
            log "Pruned unused images using crictl. $stderr"
            log "Info! Custom action 'prune_unused_images' performed successfully"
            exit 0
        else
            log "Warning! Unable to prune unused images using crictl. $stderr"
        fi
    else
        log "Warning! crictl is NOT available."
    fi

    if which ctr &>/dev/null; then
        namespaces=$(sudo ctr namespace list -q 2>/dev/null)
        if [ -z "$namespaces" ]; then
            status=1
            log "Error! Unable to fetch containerd namespaces."
        else
            for ns in $namespaces; do
                if stderr=$(sudo ctr -n "$ns" images prune 2>&1); then
                    log "Pruned unused images in namespace '$ns'. $stderr"
                else
                    status=1
                    log "Error! Unable to prune unused images in namespace '$ns'. $stderr"
                fi
            done
        fi
    else
        status=1
        log "Error! ctr is NOT available."
    fi

    if [ $status -ne 0 ]; then
        log "Error! Custom action 'prune_unused_images' failed"
        exit 1
    else
        log "Info! Custom action 'prune_unused_images' performed successfully"
        exit 0
    fi
}

check_health() {
    status=0

    # Check containerd
    health=$(sudo systemctl status containerd.service | grep "Active")
    if ! sudo systemctl status containerd.service >/dev/null; then
        status=1
        log "Error! Containerd is not healthy. $health"
    else
        log "Containerd is healthy. $health"
    fi

    # Check kubelet
    health=$(sudo systemctl status kubelet.service | grep "Active")
    if ! sudo systemctl status kubelet.service >/dev/null; then
        status=1
        log "Error! Kubelet is not healthy. $health"
    else
        log "Kubelet is healthy. $health"
    fi

    # Check worker node containers
    containers=("kube-proxy")
    for container in "${containers[@]}"; do
        container_status=$(sudo crictl ps -a --name "$container" -o yaml | grep -m 1 'state:' | awk '{print $2}')
        if [ $container_status == "CONTAINER_RUNNING" ]; then
            log "$container is healthy. container_status: $container_status"
        else
            status=1
            log "Error! $container is not healthy. container_status: $container_status"
        fi
    done

    return $status
}

restart_component() {
    status=0
    if stderr=$(sudo systemctl restart containerd.service 2>&1); then
        log "Restarted containerd.service"
    else
        status=1
        log "Error! Unable to restart containerd.service. $stderr"
    fi
    if stderr=$(sudo systemctl restart kubelet.service 2>&1); then
        log "Restarted kubelet.service"
    else
        status=1
        log "Error! Unable to restart kubelet.service. $stderr"
    fi
    return $status
}

stop_component() {
    status=0
    if stderr=$(sudo systemctl stop containerd.service 2>&1); then
        log "Stopped containerd.service"
    else
        status=1
        log "Error! Unable to stop containerd.service. $stderr"
    fi
    if stderr=$(sudo systemctl stop kubelet.service 2>&1); then
        log "Stopped kubelet.service"
    else
        status=1
        log "Error! Unable to stop kubelet.service. $stderr"
    fi
    return $status
}

print_kubeadm_log() {
    while IFS= read -r line; do
        log "$line"
    done < /home/sas/kubeadm.log
}

install() {
    precheck
    if [ $? -ne 0 ]; then
        exit 1
    fi
    install_component
    if [ $? -ne 0 ]; then
        exit 1
    else
        log "Info! Install action performed successfully"
        exit 0
    fi
}

upgrade() {
    log "Info! Updrade action performed successfully"
    exit 0
}

restart() {
    restart_component
    if [ $? -ne 0 ]; then
        exit 1
    else
        log "Info! Restart action performed successfully"
        exit 0
    fi
}

stop() {
    stop_component
    if [ $? -ne 0 ]; then
        exit 1
    else
        log "Info! Stop action performed successfully"
        exit 0
    fi
}

health() {
    check_health
    if [ $? -ne 0 ]; then
        exit 1
    else
        log "Info! Health action performed successfully"
        exit 0
    fi
}

patch() {
    log "Info! Patch action performed successfully"
    exit 0
}

version() {
    check_binaries_version
    status=$?
    version=$(sudo kubectl --kubeconfig /etc/kubernetes/kubelet.conf version --short 2>&1 | awk '/Server Version:/ { print $3 }')
    log "Kubernetes Cluster $version"
    ((status += $?))
    if [ $status -ne 0 ]; then
        exit 1
    else
        log "Info! Version action performed successfully"
        exit 0
    fi
}

heal() {
    check_health
    if [ $? -ne 0 ]; then
        restart_component
        if [ $? -ne 0 ]; then
            exit 1
        else
            log "Info! Heal action performed successfully"
            exit 0
        fi
    else
        log "Info! Heal action performed successfully"
        exit 0
    fi
}

log() {
  # This method is used by other actions.
  # Do not use exit command.
  logger -p local2.info -t \(${USER}\) primary-master[$$] "$@"
  echo "$@"
}

reinstall() {
    precheck
    if [ $? -ne 0 ]; then
        exit 1
    fi
    kubeadm_reset
    remove_config_files
    prune_containers
    log "Removed previous installation"
    install_component
    if [ $? -ne 0 ]; then
        exit 1
    else
        log "Info! Reinstall action performed successfully"
        exit 0
    fi
}

approve_csrs() {
    # This method tries to approve all pending CSR.
    # If unable to approve a CSR, throw a warning
    # and continue to approve the remaining CSR.
    status=0
    pending_csrs=$(kubectl get csr | awk '/Pending/ {print $1}')
    if [ -z "$pending_csrs" ]; then
        log "No pending CSR available"
    fi
    for csr in $pending_csrs; do
        if kubectl certificate approve $csr; then
            log "Approved CSR: $csr"
        else
            log "Warning! Unable to approve CSR: $csr"
            status=1
        fi
    done
    if [ $status -ne 0 ]; then
        log "Error! Custom action 'approve_csrs' failed"
        exit 1
    else
        log "Info! Custom action 'approve_csrs' performed successfully"
        exit 0
    fi
}

label_as_worker() {
    # This method will assign the role 'worker' to the node
    kubectl label node $MACHINE_IP node-role.kubernetes.io/worker=""
    if [ $? -ne 0 ]; then
        log "Error! Custom action 'label_as_worker' failed"
        exit 1
    else
        log "Info! Custom action 'label_as_worker' performed successfully"
        exit 0
    fi
}

uninstall() {
  status=0
  precheck
  ((status += $?))
  kubeadm_reset
  ((status += $?))
  remove_config_files
  ((status += $?))
  prune_containers
  ((status += $?))
  if [ $status -ne 0 ]; then
    exit 1
  else
    log "Info! Uninstall action performed successfully"
    exit 0
  fi
}

view_kubeadm_logs() {
  cat /home/sas/kubeadm.log
  if [ $? -ne 0 ]; then
    log "Error! Custom action 'view_kubeadm_logs' failed"
    exit 1
  else
    log "Info! Custom action 'view_kubeadm_logs' performed successfully"
    exit 0
  fi
}

custom_reinstall() {
  reinstall
}

check_vlan_connection() 
{
    if [ -f "$PROPERTIES_FILE" ]; then
        T_INT_IP=$(grep "target_internal_ip" $PROPERTIES_FILE | cut -d '=' -f 2-)
        I_DOMAIN=$(grep "internal_domain" $PROPERTIES_FILE | cut -d '=' -f 2-)
        DR_IP=$(grep "dr_dc_ip" $PROPERTIES_FILE | cut -d '=' -f 2-)
        CROSS_IP=$(grep "cross_vlan_ip" $PROPERTIES_FILE | cut -d '=' -f 2-)
        B_VLAN_IP=$(grep "bdas_vlan_ip" $PROPERTIES_FILE | cut -d '=' -f 2-)
        P_PASS=$(grep "ziahub_proxy_pass" $PROPERTIES_FILE | cut -d '=' -f 2-)
    fi

    A_PORTS=("8090" "50051" "50052" "50053" "10001" "5672" "15672" "8081" "6379" "11003" "30031" "30032" "30033")
    B_PORTS=("8080" "9090")
    E_HOST="https://www.google.com"
    T_OUT=3
    E_STAT=0

    log "VLAN verification is started for $ZAC_INVENTORY_GROUP on node: $MACHINE_IP"

    if [[ "$ZAC_INVENTORY_GROUP" == *"INTERNAL"* ]]; then
        
        log "1. Verifying Domain Restriction Policy ($I_DOMAIN)..."
        if [[ -n "$I_DOMAIN" && "$I_DOMAIN" != "dummy" ]]; then
            if ping -c 1 -W $T_OUT $I_DOMAIN >/dev/null 2>&1; then
                 log "FAILURE: Internal domain ($I_DOMAIN) is reachable. Security violation."
                 E_STAT=1
            else
                 log "SUCCESS: Internal domain access is restricted (Timeout)."
            fi
        else
            log "SKIP: Internal domain not provisioned or set to dummy."
        fi

        log "2. Checking allowed ports on $T_INT_IP..."
        for port in "${A_PORTS[@]}"; do
            out=$(timeout $T_OUT curl -v telnet://$T_INT_IP:$port 2>&1)
            if [[ "$out" == *"Connected to"* ]] || [[ "$out" == *"Connection refused"* ]]; then
                log "SUCCESS: Port $port is open (whitelisted)"
            else
                log "FAILURE: Port $port is blocked (timeout)"
                E_STAT=1
            fi
        done
        
        log "3. Checking blocked ports on $T_INT_IP..."
        for port in "${B_PORTS[@]}"; do
            out=$(timeout $T_OUT curl -v telnet://$T_INT_IP:$port 2>&1)
            if [[ "$out" == *"Connected to"* ]] || [[ "$out" == *"Connection refused"* ]]; then
                log "FAILURE: Port $port should be blocked but is open"
                E_STAT=1
            else
                log "SUCCESS: Port $port is blocked (Timeout)"
            fi
        done

        log "4. Checking Internet access (Direct and Proxy)"
        if curl --connect-timeout $T_OUT -s -I $E_HOST >/dev/null 2>&1; then
            log "Security Violation: Direct Internet access detected"
            E_STAT=1
        else
            log "SUCCESS: Direct Internet access is blocked"
        fi
        
        if [[ -n "$P_PASS" && "$P_PASS" != "dummy" ]]; then
            if curl -x http://ziahub:$P_PASS@external-proxy:3128 --connect-timeout $T_OUT -s -I $E_HOST >/dev/null 2>&1; then
                log "Security Violation: Internet access via Authenticated Proxy detected"
                E_STAT=1
            else
                log "SUCCESS: Proxy Internet access blocked"
            fi
        fi

        log "5. Checking Cross-DC Connectivity to DR/MAIN ($DR_IP)..."
        if [[ -n "$DR_IP" && "$DR_IP" != "dummy" ]]; then
            output_dr=$(timeout $T_OUT curl -v telnet://$DR_IP:80 2>&1) 
            if [[ "$output_dr" == *"Connected to"* ]] || [[ "$output_dr" == *"Connection refused"* ]]; then
                 log "SUCCESS: Cross DC path to $DR_IP is OPEN (Allowed)"
            else
                 log "FAILURE: Cross DC path to $DR_IP is BLOCKED (Violation)"
                 E_STAT=1
            fi
        fi
        
        log "6. Checking External VLAN isolation via Cross IP ($CROSS_IP)..."
        if [[ -n "$CROSS_IP" && "$CROSS_IP" != "dummy" ]]; then
            out_cross=$(timeout $T_OUT curl -v telnet://$CROSS_IP:80 2>&1)
            if [[ "$out_cross" == *"Connected to"* ]] || [[ "$out_cross" == *"Connection refused"* ]]; then
                 log "FAILURE: External VLAN node ($CROSS_IP) is reachable from Internal VLAN"
                 E_STAT=1
            else
                 log "SUCCESS: External VLAN is not reachable from Internal VLAN"
            fi
        fi

    elif [[ "$ZAC_INVENTORY_GROUP" == *"EXTERNAL"* ]]; then
        log "1. Checking access to Internal, Common, and BDAS VLANs..."
        
        if [[ -n "$CROSS_IP" && "$CROSS_IP" != "dummy" ]]; then
            out_int=$(timeout $T_OUT curl -v telnet://$CROSS_IP:80 2>&1)
            if [[ "$out_int" == *"Connected to"* ]] || [[ "$out_int" == *"Connection refused"* ]]; then
                log "FAILURE: Internal VLAN Node ($CROSS_IP) reachable from External VLAN"
                E_STAT=1
            else
                log "SUCCESS: Internal VLAN Node ($CROSS_IP) is isolated"
            fi
        fi

        if [[ -n "$B_VLAN_IP" && "$B_VLAN_IP" != "dummy" ]]; then
            out_bdas=$(timeout $T_OUT curl -v telnet://$B_VLAN_IP:80 2>&1)
            if [[ "$out_bdas" == *"Connected to"* ]] || [[ "$out_bdas" == *"Connection refused"* ]]; then
                log "FAILURE: BDAS VLAN Resource ($B_VLAN_IP) reachable from External VLAN"
                E_STAT=1
            else
                log "SUCCESS: BDAS VLAN Resource ($B_VLAN_IP) is isolated"
            fi
        fi

        if [[ -n "$T_INT_IP" && "$T_INT_IP" != "dummy" ]]; then
            out_comm=$(timeout $T_OUT curl -v telnet://$T_INT_IP:8090 2>&1)
            if [[ "$out_comm" == *"Connected to"* ]] || [[ "$out_comm" == *"Connection refused"* ]]; then
                log "FAILURE: Common VLAN Resource ($T_INT_IP) reachable from External VLAN"
                E_STAT=1
            else
                log "SUCCESS: Common VLAN Resource ($T_INT_IP) is isolated"
            fi
        fi

        [ $E_STAT -eq 0 ] && log "SUCCESS: Internal, Common, and BDAS VLANs are not reachable from External VLAN"
        
        log "2. Checking Internet Access..."
        if curl --connect-timeout $T_OUT -s -I $E_HOST >/dev/null 2>&1; then
             log "SUCCESS: Internet is reachable from External VLAN"
        else
             log "FAILURE: Internet is unreachable from External VLAN"
             E_STAT=1
        fi
    fi
    
    if [ $E_STAT -eq 0 ]; then
        log "VLAN Verification Passed"
        exit 0
    else
        log "VLAN Verification Failed"
        exit 1
    fi
}



#######################################
# Run switch prechecks on RW.
# Returns:
#   0 on success, non-zero on error.
#######################################
switchPrecheck() {
    log "SwitchU pre-checks action started"
    log "SwitchU pre-checks action ended"
    exit 0
}

#######################################
# Run switch prechecks on RO.
# Returns:
#   0 on success, non-zero on error.
#######################################
switchPrecheckRO() {
    log "SwitchU RO pre-checks action started"
    log "SwitchU RO pre-checks action ended"
    exit 0
}

#######################################
# Force switch RO to RW mode if RO is down.
# Returns:
#   0 on success, non-zero on error.
#######################################
forceSwitchOn() {
    log "Force SwitchOn action started"
    switchOn
    log "Force SwitchOn action ended"
    exit 0
}

#######################################
# Switch RO to RW mode.
# Returns:
#   0 on success, non-zero on error.
#######################################
switchOn() {
    log "SwitchOn action started"
    log "SwitchOn action ended"
    exit 0
}

#######################################
# Switch RW to RO mode.
# Returns:
#   0 on success, non-zero on error.
#######################################
switchOff() {
    log "SwitchOff action started"
    log "SwitchOff action ended"
    exit 0
}

check_avx_flags() {
  log "checking AVX and FMA support on Linux x86_64:"
  has_avx=0
  if grep -q "avx" /proc/cpuinfo 2>/dev/null; then
      has_avx=1
      log "✓ AVX (Advanced Vector Extensions) - Supported"
  else
      log "✗ AVX (Advanced Vector Extensions) - Not supported"
  fi
  
  if grep -q "avx2" /proc/cpuinfo 2>/dev/null; then
      log "✓ AVX2 - Supported"
  else
      log "✗ AVX2 - Not supported"
  fi
  
  if grep -q "fma" /proc/cpuinfo 2>/dev/null; then
      log "✓ FMA (Fused Multiply-Add) - Supported"
  else
      log "✗ FMA (Fused Multiply-Add) - Not supported"
  fi
  
  if grep -q "avx512" /proc/cpuinfo 2>/dev/null; then
      log "✓ AVX512 - Supported"
  else
      log "✗ AVX512 - Not supported"
  fi
  # return success if at least basic AVX is supported
  if [[ $has_avx -eq 1 ]]; then
      log "AVX is supported in this machine"
      exit 0
  else
      log "AVX is NOT supported in this machine"
      exit 1
  fi
}

generate_isc_signature() {

  local tmp_key
  tmp_key=$(mktemp)

  printf '%s' "$ISC_PRIVATE_KEY" | tr -d ' \n' \
    | perl -pe 's/([0-9a-fA-F]{2})/chr(hex($1))/ge' \
    > /tmp/key.der

  openssl rsa -inform DER -in /tmp/key.der -out "$tmp_key" >/dev/null 2>&1 || {
    echo "Invalid private key material"
    rm -f /tmp/key.der "$tmp_key"
    return 1
  }

  rm -f /tmp/key.der

  local current_time
  current_time=$(($(date +%s)*1000))

  local signature
  signature=$(printf '%s' "$current_time" \
    | openssl dgst -md5 -sign "$tmp_key" \
    | od -An -tx1 | tr -d ' \n' | tr 'a-f' 'A-F')

  rm -f "$tmp_key"

  echo "${SERVICE_NAME}-${current_time}-${signature}"
}

fetch_access_token() {
  local isc_signature
  isc_signature=$(generate_isc_signature) || {
    log "ISC signature generation failed"
    return 1
  }

  local token
  token=$(curl -s \
    -x "$KITES_PROXY_URL" \
    -H "Authorization: SystemAuth ${isc_signature}" \
    -H "X-CLIENT-SERVICE: dataintelligence" \
    -H "X-TOKEN-SERVICE: ZOS" \
    "${APP_GRID_URL}/RedisOperation/stratus/token?serviceName=ZOS" \
    | sed -n 's/.*"accessToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
  )

  [[ -z "$token" || "$token" == "null" ]] && {
    log "Failed to obtain access token"
    return 1
  }

  echo "$token"
}


stratus_curl() {
  local url="$1"
  local output="$2"

  local http_code

  http_code=$(curl -s -w "%{http_code}" \
    -x "$KITES_PROXY_URL" \
    -H "Authorization: Zoho-oauthtoken $ACCESS_TOKEN" \
    "$url" \
    -o "$output"
  )

  if [[ "$http_code" == "401" ]]; then
    log "Access token expired, refreshing..."

    ACCESS_TOKEN=$(fetch_access_token) || return 1
    export ACCESS_TOKEN

    http_code=$(curl -s -w "%{http_code}" \
      -x "$KITES_PROXY_URL" \
      -H "Authorization: Zoho-oauthtoken $ACCESS_TOKEN" \
      "$url" \
      -o "$output"
    )
  fi

  [[ "$http_code" =~ ^2 ]] || {
    log "Stratus request failed ($http_code): $url"
    return 1
  }

  return 0
}

prepare_default_namespace() {
  if [[ "$STRATUS_BACKUP_REQUIRED" == "true" && -d "$BASE_DIR" ]]; then
    BACKUP_DIR="${BASE_DIR}-backup"

    rm -rf "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"

    cp -a "$BASE_DIR"/. "$BACKUP_DIR"/
    rm -rf "$BASE_DIR"
  fi

  mkdir -p "$BASE_DIR"
}


setup_secondary_namespaces() {
  [[ -z "$SECONDARY_NAMESPACES" ]] && return 0

  IFS=',' read -ra NAMESPACES <<< "$SECONDARY_NAMESPACES"

  for ns in "${NAMESPACES[@]}"; do
    ns=$(echo "$ns" | xargs)
    [[ -z "$ns" ]] && continue

    LINK_PATH="/home/sas/volumes/$ns"

    if [[ -L "$LINK_PATH" || -e "$LINK_PATH" ]]; then
      rm -rf "$LINK_PATH"
    fi

    ln -s "$(basename "$BASE_DIR")" "$LINK_PATH"
  done
}



sync_stratus_objects() {
  prepare_default_namespace
  setup_secondary_namespaces

  list_all_keys() {
    local url="$STRATUS_URL/?objects=&orderBy=desc&sortBy=size"

    while true; do
      local resp_file
      resp_file=$(mktemp)

      stratus_curl "$url" "$resp_file" || exit 1

      # Extract ALL keys (reliable)
      tr -d '\n' < "$resp_file" \
        | grep -o '"key"[[:space:]]*:[[:space:]]*"[^"]*"' \
        | sed 's/.*"key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'

      # Extract continuation token
      local next_token
      next_token=$(
        tr -d '\n' < "$resp_file" \
          | sed -n 's/.*"next_continuation_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
      )

      rm -f "$resp_file"
      [[ -z "$next_token" ]] && break

      url="$STRATUS_URL/?objects=&continuationToken=$next_token&orderBy=desc&sortBy=size"
    done
  }

  download_one() {
    local key="$1"
    local final="$BASE_DIR/$key"
    local tmp="${final}.tmp"

    [[ -f "$final" ]] && return 0

    mkdir -p "$(dirname "$final")"
    trap 'rm -f "$tmp"' ERR

    stratus_curl "$STRATUS_URL/$key" "$tmp" || return 1
    mv "$tmp" "$final"

    trap - ERR
  }

  export -f log stratus_curl fetch_access_token generate_isc_signature download_one
  export ACCESS_TOKEN STRATUS_URL BASE_DIR KITES_PROXY_URL ISC_PRIVATE_KEY SERVICE_NAME APP_GRID_URL

  list_all_keys \
    | sort \
    | xargs -n 1 -P "$PARALLEL_WORKERS" -I {} bash -c 'download_one "$@"' _ {}
}

download_saved_models() {
  log "Downloading saved models from Stratus..."

  ACCESS_TOKEN=$(fetch_access_token) || exit 1
  export ACCESS_TOKEN

  sync_stratus_objects

  log "Download completed successfully."
}

label_node_tier() {
    TIER_VAL=$1
    if [[ -z "$TIER_VAL" ]]; then
        log "ERROR: GPU tier value is not provided as argument."
        exit 1
    fi
    log "Applying GPU labels to node: $MACHINE_IP with tier: $TIER_VAL"

    # Define the standard config path used on workers
    KUBECONFIG_PATH="/etc/kubernetes/kubelet.conf"

    # Use sudo and explicitly point to the kubeconfig
    sudo kubectl --kubeconfig "$KUBECONFIG_PATH" label node "$MACHINE_IP" "kites.zoho.com/gpu-tier=$TIER_VAL" --overwrite
    sudo kubectl --kubeconfig "$KUBECONFIG_PATH" label node "$MACHINE_IP" "kites.zoho.com/gpu-unshared=" --overwrite
    
    if [ $? -eq 0 ]; then
        log "Info! Node $MACHINE_IP successfully labeled: gpu-tier=$TIER_VAL, gpu-unshared"
        exit 0
    else
        log "ERROR: Failed to apply labels to $MACHINE_IP. Ensure /etc/kubernetes/kubelet.conf exists and you have permissions."
        exit 1
    fi
}
log "### ZAC action '$ACTION' invoked ###"
log $(readlink -f "/proc/$$/exe") "$0"

case $ACTION in
install)
    install
    ;;
upgrade)
    upgrade
    ;;
restart)
    restart
    ;;
stop)
    stop
    ;;
health)
    health
    ;;
patch)
    patch
    ;;
version)
    version
    ;;
heal)
    heal
    ;;
log)
    log
    ;;
# patch_properties)
#     patch_properties
#     ;;
reinstall)
    reinstall
    ;;
# dependency_package_update)
#     dependency_package_update
#     ;;
# currentrole)
#   currentrole
#   ;;
# replaceFailedServer)
#     replaceFailedServer
#     ;;
# restore)
#     restore
#     ;;
forceSwitchOn)
    forceSwitchOn
    ;;
switchPrecheck)
    switchPrecheck
    ;;
switchPrecheckRO)
    switchPrecheckRO
    ;;
switchOff)
    switchOff
    ;;
switchOn)
    switchOn
    ;;
# Custom actions:
approve_csrs)
    approve_csrs
    ;;
label_as_worker)
    label_as_worker
    ;;
uninstall)
    uninstall
    ;;
view_kubeadm_logs)
    view_kubeadm_logs
    ;;
custom_reinstall)
    custom_reinstall
    ;;
label_node_tier)
    label_node_tier $4
    ;;
check_avx_flags)
  check_avx_flags
  ;;
check_vlan_connection)
    check_vlan_connection $4
    ;;
download_saved_models)
  download_saved_models
  ;;
prune_unused_images)
  prune_unused_images
  ;;
*)
    log "Invalid action specified. action: $ACTION"
    ;;
esac
