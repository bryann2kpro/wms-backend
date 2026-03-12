/**
 * RBAC GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Role-Based Access Control operations.
 * Resolvers are in rbac.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Role in the WMS system
  """
  type RbacRole {
    roleId: ID!
    roleName: String!
    status: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
    permissions: [RolePermissionInfo!]!
  }

  """
  Module (feature area) in the WMS system
  """
  type RbacModule {
    moduleId: ID!
    moduleName: String!
    status: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
    permissions: [RbacPermission!]!
  }

  """
  Permission in the WMS system
  """
  type RbacPermission {
    permissionId: ID!
    moduleId: ID!
    permissionType: String!
    description: String
    status: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Permission information attached to a role
  """
  type RolePermissionInfo {
    id: ID!
    permissionId: ID!
    permissionType: String!
    moduleId: ID!
    moduleName: String!
  }

  """
  User role assignment
  """
  type UserRoleAssignment {
    id: ID!
    userId: ID!
    userName: String!
    roleId: ID!
    roleName: String!
    status: String!
    createdAt: String!
    updatedAt: String!
  }

  """
  Input for creating a new module
  """
  input CreateModuleInput {
    moduleName: String!
    status: String
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating a module
  """
  input UpdateModuleInput {
    moduleName: String
    status: String
    updatedBy: String!
  }

  """
  Input for creating a new role
  """
  input CreateRoleInput {
    roleName: String!
    status: String
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating a role
  """
  input UpdateRoleInput {
    roleName: String
    status: String
    updatedBy: String!
  }

  extend type Query {
    """
    Get all roles.
    Requires Role:Read permission.
    """
    roles: [RbacRole!]! @requirePermission(module: "Role", permission: "Read")
    
    """
    Get a single role by ID.
    Requires Role:Read permission.
    """
    role(id: ID!): RbacRole @requirePermission(module: "Role", permission: "Read")
    
    """
    Get all modules with their permissions.
    Requires Role:Read permission.
    """
    modules: [RbacModule!]! @requirePermission(module: "Role", permission: "Read")
    
    """
    Get all permissions.
    Requires Role:Read permission.
    """
    permissions: [RbacPermission!]! @requirePermission(module: "Role", permission: "Read")
    
    """
    Get permissions for a specific role.
    Requires Role:Read permission.
    """
    rolePermissions(roleId: ID!): [RolePermissionInfo!]! @requirePermission(module: "Role", permission: "Read")
    
    """
    Get all user role assignments.
    Requires Role:Read permission.
    """
    userRoles: [UserRoleAssignment!]! @requirePermission(module: "Role", permission: "Read")
  }

  extend type Mutation {
    """
    Create a new module.
    Requires Role:create permission.
    """
    createModule(input: CreateModuleInput!): RbacModule! @requirePermission(module: "Role", permission: "create")

    """
    Update an existing module.
    Requires Role:update permission.
    """
    updateModule(id: ID!, input: UpdateModuleInput!): RbacModule @requirePermission(module: "Role", permission: "update")

    """
    Create a new role.
    Requires Role:create permission.
    """
    createRole(input: CreateRoleInput!): RbacRole! @requirePermission(module: "Role", permission: "create")
    
    """
    Update an existing role.
    Requires Role:update permission.
    """
    updateRole(id: ID!, input: UpdateRoleInput!): RbacRole @requirePermission(module: "Role", permission: "update")
  }
`;
