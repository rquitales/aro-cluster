import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import * as azure_native from "@pulumi/azure-native";
import * as azuread from "@pulumi/azuread";
import * as random from "@pulumi/random";

// Create relevant Azure Resource Groups.
const aroResourceGroup = new azure_native.resources.ResourceGroup("aroRG");
const aroResourceGroup2 = new azure_native.resources.ResourceGroup("aroRG2");

// Get current Azure details.
const currConfig = azuread.getClientConfig({});
const currSubscription = azure.core.getSubscription({});

// Create Azure AD Application and Service Principal.
const aroApp = new azuread.Application("aroApplication", {
  displayName: "aroApplication",
  owners: [currConfig.then((current) => current.objectId)],
});
const aroSvcPrincipal = new azuread.ServicePrincipal(
  "aroSvcPrincipal",
  {
    applicationId: aroApp.applicationId,
    appRoleAssignmentRequired: false,
    owners: [currConfig.then((current) => current.objectId)],
  }
);
const aroSvcPrincipalPswd = new azuread.ServicePrincipalPassword(
  "aroSvcPrincipalPswd",
  {
    endDate: "2099-01-01T00:00:00Z",
    servicePrincipalId: aroSvcPrincipal.id,
  }
);

// Create virtual network and subnets.
const virtualNetwork = new azure_native.network.VirtualNetwork(
  "virtualNetwork",
  {
    addressSpace: {
      addressPrefixes: ["10.0.0.0/16"],
    },
    location: "westus2",
    resourceGroupName: aroResourceGroup.name,
    virtualNetworkName: "aro-vnet",
  }
);

// Create subnet for control plane nodes.
const subnet = new azure_native.network.Subnet("subnetCP", {
  addressPrefix: "10.0.0.0/27",
  resourceGroupName: aroResourceGroup.name,
  subnetName: "subnet-cp",
  virtualNetworkName: virtualNetwork.name,
});

// Create subnet for worker nodes.
const subnetWorker = new azure_native.network.Subnet("subnetWorker", {
  addressPrefix: "10.0.0.128/25",
  resourceGroupName: aroResourceGroup.name,
  subnetName: "subnet-worker",
  virtualNetworkName: virtualNetwork.name,
});

// ######### Permissions #########
// Grant network contributor permissions to service principal on vnet.
// 4d97b98b-1d4f-4787-a291-c67834d212e7 is the role definition id for network contributor.
const id1 = new random.RandomUuid("id1", {});
const roleAssignment1 = new azure_native.authorization.RoleAssignment(
  "roleAssignment1",
  {
    principalId: aroSvcPrincipal.id,
    principalType: "ServicePrincipal",
    roleAssignmentName: id1.result,
    roleDefinitionId: `/subscriptions/${currSubscription.then(
      (current) => current.subscriptionId
    )}/providers/Microsoft.Authorization/roleDefinitions/4d97b98b-1d4f-4787-a291-c67834d212e7`,
    scope: virtualNetwork.id,
  }
);

// Grant network contributor permissions to resource provider service principal on vnet.
// This may not be necessary?
const id2 = new random.RandomUuid("id2", {});
const roleAssignment2 = new azure_native.authorization.RoleAssignment(
  "roleAssignment2",
  {
    principalId: "f1dd0a37-89c6-4e07-bcd1-ffd3d43d8875",
    principalType: "ServicePrincipal",
    roleAssignmentName: id2.result,
    roleDefinitionId: `/subscriptions/${currSubscription.then(
      (current) => current.subscriptionId
    )}/providers/Microsoft.Authorization/roleDefinitions/4d97b98b-1d4f-4787-a291-c67834d212e7`,
    scope: virtualNetwork.id,
  }
);

// Grant network contributor permissions to resource provider service principal's object ID on vnet.
const id3 = new random.RandomUuid("id3", {});
const roleAssignment3 = new azure_native.authorization.RoleAssignment(
  "roleAssignment3",
  {
    principalId: "86b14cb4-03ab-493b-b08b-a87f4998e748",
    principalType: "ServicePrincipal",
    roleAssignmentName: id3.result,
    roleDefinitionId: `/subscriptions/${currSubscription.then(
      (current) => current.subscriptionId
    )}/providers/Microsoft.Authorization/roleDefinitions/4d97b98b-1d4f-4787-a291-c67834d212e7`,
    scope: virtualNetwork.id,
  }
);

// Grant network contributor permissions to service principal on cluster resource group.
const id4 = new random.RandomUuid("id4", {});
const roleAssignment4 = new azure_native.authorization.RoleAssignment(
  "roleAssignment4",
  {
    principalId: aroSvcPrincipal.id,
    principalType: "ServicePrincipal",
    roleAssignmentName: id4.result,
    roleDefinitionId: `/subscriptions/${currSubscription.then(
      (current) => current.subscriptionId
    )}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`,
    scope: aroResourceGroup2.id,
  },
);

// ######### Create ARO Cluster #########
const openShiftCluster = new azure_native.redhatopenshift.OpenShiftCluster(
  "openShiftCluster",
  {
    apiserverProfile: {
      visibility: "Public",
    },
    clusterProfile: {
      domain: "cluster.customdomain.com", // Optional
      resourceGroupId: aroResourceGroup2.id, // Must be different from the other resource group.
    },
    consoleProfile: {},
    ingressProfiles: [
      {
        name: "default",
        visibility: "Public",
      },
    ],
    location: "westus2",
    masterProfile: {
      vmSize: "Standard_D8s_v3",
      subnetId: subnet.id,
    },
    networkProfile: {
      podCidr: "10.128.0.0/14",
      serviceCidr: "172.30.0.0/16",
    },
    resourceGroupName: aroResourceGroup.name,
    resourceName: "my-cluster",
    servicePrincipalProfile: {
      clientId: aroApp.applicationId,
      clientSecret: aroSvcPrincipalPswd.value,
    },
    tags: {
      key: "value",
    },
    workerProfiles: [
      {
        count: 3,
        diskSizeGB: 128,
        name: "worker",
        vmSize: "Standard_E2s_v4",
        subnetId: subnetWorker.id,
      },
    ],
  }
);

// ######### Get Cluster Credentials #########
// TODO: Fix the export here.
// var credsResult: Promise<azure_native.redhatopenshift.ListOpenShiftClusterCredentialsResult>;
// aroResourceGroup2.name.apply((name) => {
//     credsResult = azure_native.redhatopenshift.listOpenShiftClusterCredentials({
//         resourceGroupName: name,
//         resourceName: "my-cluster",
//     });
// });

// ######### Export Variables #########
// export const creds = credsResult;
export const aroResourceGroupID = aroResourceGroup.id;
export const aroResourceGroup2ID = aroResourceGroup2.id;
export const vnetID = virtualNetwork.id;
export const appId = aroApp.applicationId;
export const servicePrincipalId = aroSvcPrincipal.id;