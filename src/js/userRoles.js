import { useContext } from "react";
import { UserDataContext } from "../Context";

const roles_map = {
  owner: {
    permissions: ["view", "make_copy", "edit", "delete", "save", "share", "transfer", "manage_versions"],
    public: false,
  },
  admin: {
    permissions: ["view", "make_copy", "edit", "delete", "save", "manage_versions"], //, "share"],
    public: true,
  },
  editor: {
    permissions: ["view", "make_copy", "edit", "save"],
    public: true,
  },
  guest: {
    permissions: ["view", "make_copy"],
    public: true,
  },
};

/**
 * Determine if the user is allowed to perform an action (Custom hook with access to a context)
 * @param {import("./types").ParamElePermissions} permission
 * @returns {boolean}
 */
const useUserAllowed = (permission) => {
  const user_role = useContext(UserDataContext).role;
  if (user_role == null) return false;
  return roles_map[user_role].permissions.includes(permission);
};

const getRoleDescription = () => {
  // WIP - Build the description and return
};

/**
 *
 * @returns {string[]} List with all the keys of the possible roles
 */
const getAllRolesKeys = () => {
  return Object.keys(roles_map);
};

const getPublicRolesKeys = () => {
  return Object.keys(roles_map).filter((role_key) => roles_map[role_key].public);
};

export { getRoleDescription, getAllRolesKeys, getPublicRolesKeys, useUserAllowed };
