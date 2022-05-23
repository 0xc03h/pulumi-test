import * as k8s from "@pulumi/kubernetes";
import { Deployment } from "@pulumi/kubernetes/apps/v1";
import {
  ConfigMap,
  Namespace,
  PersistentVolume,
  PersistentVolumeClaim,
  Service,
} from "@pulumi/kubernetes/core/v1";
import { StorageClass } from "@pulumi/kubernetes/storage/v1";
import * as kx from "@pulumi/kubernetesx";
import { Config } from "@pulumi/pulumi";

let config = new Config();
const appName = config.require("name");
//const nameSpace = config.require("namespace");
const ns = new Namespace(config.require("namespace"));
export const nameSpace = ns.metadata.name;
const appLabels = { app: appName };
const nginxDeploy = new Deployment(`nginx`, {
  metadata: { namespace: nameSpace },
  spec: {
    selector: { matchLabels: appLabels },
    replicas: 2,
    strategy: {
      rollingUpdate: { maxSurge: "25%", maxUnavailable: "25%" },
      type: "RollingUpdate",
    },
    template: {
      metadata: { labels: appLabels },
      spec: {
        containers: [
          {
            name: "myapp1",
            image: config.require("image"),
            resources: {
              requests: {
                cpu: "50m",
                memory: "10Mi",
              },
              limits: {
                cpu: "50m",
                memory: "10Mi",
              },
            },
          },
        ],
      },
    },
  },
});

const frontend = new Service(`frontend`, {
  metadata: { labels: appLabels, namespace: nameSpace },
  spec: {
    type: "LoadBalancer",
    ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
    selector: appLabels,
  },
});

// const sc = new StorageClass("storeclass", {
//   metadata: { labels: appLabels, name: "standard" },
//   provisioner: "kubernetes.io/no-provisioner",
//   volumeBindingMode: "WaitForFirstConsumer",
// });

// export const storclass = sc.metadata.name;

const pvolume = new PersistentVolume(`pv`, {
  metadata: {
    name: "mysql-pv-volume",
    labels: appLabels,
    namespace: nameSpace,
  },
  spec: {
    storageClassName: "standard",
    capacity: { storage: "1Gi" },
    accessModes: ["ReadWriteOnce"],
    persistentVolumeReclaimPolicy: "Retain",
    hostPath: { path: "/tmp/data" },
  },
});

const pvclaim = new PersistentVolumeClaim(`pvc`, {
  metadata: { labels: appLabels, namespace: nameSpace },
  spec: {
    storageClassName: "standard",
    accessModes: ["ReadWriteOnce"],
    resources: {
      requests: { storage: "1Gi" },
    },
  },
});

export const pvc = pvclaim.metadata.name;

const cm = new ConfigMap(`configmap`, {
  metadata: {
    name: "usermanagement-dbcreation-script",
    namespace: nameSpace,
  },
  data: {
    "mysql_usermgmt.sql": `|-
DROP DATABASE IF EXISTS webappdb;
CREATE DATABASE webappdb;`.toString(),
  },
});

export const confmap = cm.metadata.name;

const mysqlDeploy = new Deployment("mysql", {
  metadata: { namespace: nameSpace, labels: appLabels, name: "mysql" },
  spec: {
    selector: { matchLabels: appLabels },
    replicas: 1,
    strategy: { type: "Recreate" },
    template: {
      metadata: {
        labels: appLabels,
      },
      spec: {
        containers: [
          {
            name: "mysql",
            image: "mysql:5.6",
            env: [
              {
                name: "MYSQL_ROOT_PASSWORD",
                value: "dbpassword11",
              },
            ],
            ports: [
              {
                containerPort: 3306,
                name: "mysql",
              },
            ],
            volumeMounts: [
              {
                name: "mysql-persistent-storage",
                mountPath: "/var/lib/mysql",
              },
              {
                name: "usermanagement-dbcreation-script",
                mountPath: "/docker-entrypoint-initdb.d",
              },
            ],
          },
        ],
        volumes: [
          {
            name: "mysql-persistent-storage",
            persistentVolumeClaim: { claimName: pvc },
          },
          {
            name: "usermanagement-dbcreation-script",
            configMap: { name: "usermanagement-dbcreation-script" },
          },
        ],
      },
    },
  },
});

const mysql = new Service(`mysql`, {
  metadata: { labels: appLabels, namespace: nameSpace },
  spec: {
    type: "LoadBalancer",
    ports: [{ port: 3306, targetPort: 3306, protocol: "TCP" }],
    selector: appLabels,
  },
});

export const ip = frontend.status.loadBalancer.apply(
  (lb) => lb.ingress[0].ip || lb.ingress[0].hostname
);
export const name = nginxDeploy.metadata.name;
//export const pv = pvolume.metadata.name;
