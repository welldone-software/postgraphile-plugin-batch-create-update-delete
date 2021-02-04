import { omitBy } from "lodash";
import { GraphQLInputObjectType } from "./pluginTypes";

export const createTypeWithoutNestedInputTypes = ({
  inputType,
  name,
  description,
}: {
  inputType: GraphQLInputObjectType;
  name?: string;
  description?: string;
}) => {
  const fieldsWithoutNestedInputTypes = omitBy(inputType.getFields(), (field) =>
    GraphQLInputObjectType.prototype.isPrototypeOf(field.type)
  );

  const newType = new GraphQLInputObjectType({
    name: name || `Multi${inputType.name}`,
    description: description || inputType.description,
    fields: {
      ...fieldsWithoutNestedInputTypes,
    },
  });

  return newType;
};
