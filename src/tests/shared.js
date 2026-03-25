import { Record } from 'immutable';

export const DateMarshaller = {
  deserialize: (response) => new Date(response),
  serialize: (date) => date.toJSON(),
};

export const Role = Record({
  id: undefined,
  name: undefined,
});

export const AdminRole = Role({ id: 1, name: 'Admin' });
export const EditorRole = Role({ id: 2, name: 'Editor' });

export const RoleMarshaller = {
  deserialize: (response) => {
    switch (response) {
      case 1:
        return AdminRole;
      case 2:
        return EditorRole;
      default:
        return undefined;
    }
  },
  serialize: (role) => role.id,
};
