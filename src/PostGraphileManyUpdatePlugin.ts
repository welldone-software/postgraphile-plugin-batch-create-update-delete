import * as T from "./pluginTypes";
import debugFactory from "debug";
const debug = debugFactory("graphile-build-pg");
import { createTypeWithoutNestedInputTypes } from "./utils";

const PostGraphileManyUpdatePlugin: T.Plugin = (
  builder,
  options: T.PgOptions
) => {
  /**
   * Add a hook to create the new root level create mutation
   */
  builder.hook(
    // @ts-ignore
    "GraphQLObjectType:fields",
    GQLObjectFieldsHookHandlerFcn,
    ["PgMutationManyUpdate"], // hook provides
    [], // hook before
    ["PgMutationUpdateDelete"] // hook after
  );

  /**
   * Handles adding the new "many update" root level fields
   */
  function GQLObjectFieldsHookHandlerFcn(
    fields: any,
    build: T.Build,
    context: T.Context
  ) {
    const {
      extend,
      newWithHooks,
      getNodeIdForTypeAndIdentifiers,
      getTypeAndIdentifiersFromNodeId,
      nodeIdFieldName,
      fieldDataGeneratorsByFieldNameByType,
      parseResolveInfo,
      getTypeByName,
      gql2pg,
      pgGetGqlTypeByTypeIdAndModifier,
      pgGetGqlInputTypeByTypeIdAndModifier,
      pgIntrospectionResultsByKind,
      pgSql: sql,
      graphql: {
        GraphQLNonNull,
        GraphQLInputObjectType,
        GraphQLString,
        GraphQLObjectType,
        GraphQLID,
        getNamedType,
        GraphQLList,
      },
      pgColumnFilter,
      inflection,
      pgQueryFromResolveData: queryFromResolveData,
      pgOmit: omit,
      pgViaTemporaryTable: viaTemporaryTable,
      describePgEntity,
      sqlCommentByAddingTags,
      pgField,
    } = build;
    const {
      scope: { isRootMutation },
      fieldWithHooks,
    } = context;

    if (!isRootMutation || !pgColumnFilter) return fields;

    let newFields = {},
      i: number;
    const noOfTables = pgIntrospectionResultsByKind.class.length;
    for (i = 0; i < noOfTables; i++) {
      handleAdditionsFromTableInfo(pgIntrospectionResultsByKind.class[i]);
    }

    function handleAdditionsFromTableInfo(table: T.PgClass) {
      if (
        !table.namespace ||
        !table.isUpdatable ||
        omit(table, "update") ||
        !table.tags.mncud
      )
        return;

      const tableType: T.GraphQLType = pgGetGqlTypeByTypeIdAndModifier(
        table.type.id,
        null
      );
      if (!tableType) {
        debug(
          `There was no GQL Table Type for table '${table.namespace.name}.${table.name}',
           so we're not generating a many update mutation for it.`
        );
        return;
      }
      const namedType = getNamedType(tableType);
      const tablePatch = getTypeByName(inflection.patchType(namedType.name));
      if (!tablePatch) {
        throw new Error(
          `Could not find TablePatch type for table '${table.name}'`
        );
      }

      const prefix = options.multipleMutationsPluginOptions?.prefix;
      const isPrefixProvided = !!prefix;

      const tableTypeName = namedType.name;
      const pluralTableTypeName = inflection.pluralize(tableTypeName);

      const baseNewPatchTypeName = `UpdateMulti${pluralTableTypeName}Input`;

      /*
        We need to remove nested mutations plugin types, because nested mutations are not supported in this plugin.
        But this workaround only will not allow to make both this plugin and nested mutations plugin work together.
        It is still needed to disable definition of new resolver for mutations created by this plugin in nested mutations plugin
        using isMultipleMutation flag added for all mutations created by this plugin to context
      */
      const newPatchType = createTypeWithoutNestedInputTypes({
        inputType: tablePatch,
        name: isPrefixProvided
          ? `${prefix}${baseNewPatchTypeName}`
          : baseNewPatchTypeName,
      });

      const uniqueConstraints = table.constraints.filter(
        (con) => con.type === "p"
      );

      const basePayloadName = `Update${pluralTableTypeName}Payload`;

      // Setup and add the GraphQL Payload type
      const newPayloadHookType = GraphQLObjectType;
      const newPayloadHookSpec = {
        name: isPrefixProvided
          ? `${prefix}${basePayloadName}`
          : basePayloadName,
        description: `The output of our update \`${pluralTableTypeName}\` mutation.`,
        fields: ({ fieldWithHooks }) => {
          const tableName = inflection.tableFieldName(table);
          return {
            clientMutationId: {
              description:
                "The exact same `clientMutationId` that was provided in the mutation input,\
                 unchanged and unused. May be used by a client to track mutations.",
              type: GraphQLString,
            },
            [tableName]: pgField(
              build,
              fieldWithHooks,
              tableName,
              {
                description: `The \`${pluralTableTypeName}\` that was updated by this mutation.`,
                type: new GraphQLList(new GraphQLNonNull(tableType)),
              },
              {},
              false
            ),
          };
        },
      };
      const newPayloadHookScope = {
        __origin: `Adding table many update mutation payload type for ${describePgEntity(
          table
        )}.
                   You can rename the table's GraphQL type via a 'Smart Comment':\n\n
                   ${sqlCommentByAddingTags(table, {
                     name: "newNameHere",
                   })}`,
        isMutationPayload: true,
        isPgUpdatePayloadType: true,
        pgIntrospection: table,
      };
      const PayloadType = newWithHooks(
        newPayloadHookType,
        newPayloadHookSpec,
        newPayloadHookScope
      );
      if (!PayloadType) {
        throw new Error(
          `Failed to determine payload type on the \`${pluralTableTypeName}\` mutation`
        );
      }

      // Setup and add GQL Input Types for "Unique Constraint" based updates
      // TODO: Look into adding updates via NodeId
      uniqueConstraints.forEach((constraint) => {
        if (omit(constraint, "update")) return;

        const keys = constraint.keyAttributes;
        if (!keys.every((_) => _)) {
          throw new Error(
            `Consistency error: could not find an attribute in the constraint when building the many\
             update mutation for ${describePgEntity(table)}!`
          );
        }
        if (keys.some((key) => omit(key, "read"))) return;

        const baseFieldName = inflection.updateManyByKeys(
          keys,
          table,
          constraint
        );
        const fieldName = isPrefixProvided
          ? `${prefix}${inflection.upperCamelCase(baseFieldName)}`
          : inflection.camelCase(baseFieldName);

        const newInputHookType = GraphQLInputObjectType;

        const baseInputTypeName = `Update${pluralTableTypeName}Input`;

        const patchName = inflection.patchField(
          inflection.tableFieldName(table)
        );

        const newInputHookSpec = {
          name: isPrefixProvided
            ? `${prefix}${baseInputTypeName}`
            : baseInputTypeName,
          description: `All input for the update \`${pluralTableTypeName}\` mutation.`,
          fields: Object.assign(
            {
              clientMutationId: {
                type: GraphQLString,
              },
            },
            {
              [patchName]: {
                description: `The one or many \`${tableTypeName}\` to be updated.`,
                // TODO: Add an actual type that has the PKs required
                // instead of using the tablePatch in another file,
                // and hook onto the input types to do so.
                //@ts-ignore
                type: new GraphQLList(new GraphQLNonNull(newPatchType!)),
              },
            },
            {}
          ),
        };
        const newInputHookScope = {
          __origin: `Adding table many update mutation input type for ${describePgEntity(
            constraint
          )},
                    You can rename the table's GraphQL type via a 'Smart Comment':\n\n
                    ${sqlCommentByAddingTags(table, {
                      name: "newNameHere",
                    })}`,
          isPgUpdateInputType: true,
          isPgUpdateByKeysInputType: true,
          isMutationInput: true,
          pgInflection: table,
          pgKeys: keys,
        };

        const InputType = newWithHooks(
          newInputHookType,
          newInputHookSpec,
          newInputHookScope
        );

        if (!InputType) {
          throw new Error(
            `Failed to determine input type for '${fieldName}' mutation`
          );
        }
        // Define the new mutation field
        function newFieldWithHooks(): T.FieldWithHooksFunction {
          return fieldWithHooks(
            fieldName,
            (context) => {
              context.table = table;
              context.relevantAttributes = table.attributes.filter(
                (attr) =>
                  pgColumnFilter(attr, build, context) && !omit(attr, "update")
              );
              return {
                description: `Updates one or many \`${tableTypeName}\` using a unique key and a patch.`,
                type: PayloadType,
                args: {
                  input: {
                    type: new GraphQLNonNull(InputType),
                  },
                },
                resolve: resolver.bind(context),
              };
            },
            {
              pgFieldIntrospection: table,
              pgFieldConstraint: constraint,
              isPgNodeMutation: false,
              isPgUpdateMutationField: true,
              isMultipleMutation: true,
            }
          );
        }

        async function resolver(_data, args, resolveContext, resolveInfo) {
          const { input } = args;
          const {
            table,
            getDataFromParsedResolveInfoFragment,
            relevantAttributes,
          }: {
            table: T.PgClass;
            getDataFromParsedResolveInfoFragment: any;
            relevantAttributes: any;
            // @ts-ignore
          } = this;
          const { pgClient } = resolveContext;

          const parsedResolveInfoFragment = parseResolveInfo(resolveInfo);
          // @ts-ignore
          parsedResolveInfoFragment.args = args; // Allow overriding via makeWrapResolversPlugin

          const resolveData = getDataFromParsedResolveInfoFragment(
            parsedResolveInfoFragment,
            PayloadType
          );

          const sqlColumns: T.SQL[] = [];
          const sqlColumnTypes: T.SQL[] = [];
          const allSQLColumns: T.SQL[] = [];

          const inputData: Object[] =
            input[inflection.patchField(inflection.tableFieldName(table))];

          if (!inputData || inputData.length === 0) return null;
          const sqlValues: T.SQL[][] = Array(inputData.length).fill([]);

          const usedSQLColumns: T.SQL[] = [];
          const usedColSQLVals: T.SQL[][] = Array(inputData.length).fill([]);
          let hasConstraintValue = true;

          inputData.forEach((dataObj, i) => {
            let setOfRcvdDataHasPKValue = false;

            relevantAttributes.forEach((attr: T.PgAttribute) => {
              const fieldName = inflection.column(attr);
              const dataValue = dataObj[fieldName];

              const isConstraintAttr = keys.some(
                (key) => key.name === attr.name
              );

              // Store all attributes on the first run.
              // Skip the primary keys, since we can't update those.
              if (i === 0 && !isConstraintAttr) {
                sqlColumns.push(sql.raw(attr.name));
                usedSQLColumns.push(sql.raw("use_" + attr.name));
                // Handle custom types
                if (attr.type.namespaceName !== "pg_catalog") {
                  sqlColumnTypes.push(
                    sql.raw(attr.class.namespaceName + "." + attr.type.name)
                  );
                } else {
                  sqlColumnTypes.push(sql.raw(attr.type.name));
                }
              }
              // Get all of the attributes
              if (i === 0) {
                allSQLColumns.push(sql.raw(attr.name));
              }
              // Push the data value if it exists, else push
              // a dummy null value (which will not be used).
              if (fieldName in dataObj) {
                sqlValues[i] = [
                  ...sqlValues[i],
                  gql2pg(dataValue, attr.type, attr.typeModifier),
                ];
                if (!isConstraintAttr) {
                  usedColSQLVals[i] = [...usedColSQLVals[i], sql.raw("true")];
                } else {
                  setOfRcvdDataHasPKValue = true;
                }
              } else {
                sqlValues[i] = [...sqlValues[i], sql.raw("NULL")];
                if (!isConstraintAttr) {
                  usedColSQLVals[i] = [...usedColSQLVals[i], sql.raw("false")];
                }
              }
            });
            if (!setOfRcvdDataHasPKValue) {
              hasConstraintValue = false;
            }
          });

          if (!hasConstraintValue) {
            throw new Error(
              `You must provide the primary key(s) in the updated data for updates on '${inflection.pluralize(
                inflection._singularizedTableName(table)
              )}'`
            );
          }

          if (sqlColumns.length === 0) return null;

          // https://stackoverflow.com/questions/63290696/update-multiple-rows-using-postgresql
          const mutationQuery = sql.query`\ 
          UPDATE ${sql.identifier(table.namespace.name, table.name)} t1 SET
            ${sql.join(
              sqlColumns.map(
                (col, i) =>
                  sql.fragment`"${col}" = (CASE WHEN t2."use_${col}" THEN t2."${col}"::${sqlColumnTypes[i]} ELSE t1."${col}" END)`
              ),
              ", "
            )}
          FROM (VALUES
                (${sql.join(
                  sqlValues.map(
                    (dataGroup, i) =>
                      sql.fragment`${sql.join(
                        dataGroup.concat(usedColSQLVals[i]),
                        ", "
                      )}`
                  ),
                  "),("
                )})
               ) t2(
                 ${sql.join(
                   allSQLColumns
                     .map((col) => sql.fragment`"${col}"`)
                     .concat(
                       usedSQLColumns.map((useCol) => sql.fragment`"${useCol}"`)
                     ),
                   ", "
                 )}
               )
          WHERE ${sql.fragment`(${sql.join(
            keys.map(
              (key) =>
                sql.fragment`t2.${sql.identifier(key.name)}::${sql.raw(
                  key.type.name
                )} = t1.${sql.identifier(key.name)}`
            ),
            ") and ("
          )})`}
          RETURNING ${sql.join(
            allSQLColumns.map((col) => sql.fragment`t1."${col}"`),
            ", "
          )}
          `;

          const modifiedRowAlias = sql.identifier(Symbol());
          const query = queryFromResolveData(
            modifiedRowAlias,
            modifiedRowAlias,
            resolveData,
            {},
            null,
            resolveContext,
            resolveInfo.rootValue
          );

          let rows;
          try {
            await pgClient.query("SAVEPOINT graphql_mutation");
            rows = await viaTemporaryTable(
              pgClient,
              sql.identifier(table.namespace.name, table.name),
              mutationQuery,
              modifiedRowAlias,
              query
            );
            await pgClient.query("RELEASE SAVEPOINT graphql_mutation");
          } catch (e) {
            await pgClient.query("ROLLBACK TO SAVEPOINT graphql_mutation");
            throw e;
          }

          if (!rows.length) {
            throw new Error(
              `No values were updated in collection '${inflection.pluralize(
                inflection._singularizedTableName(table)
              )}' because no values you can update were found matching these criteria.`
            );
          }
          return {
            clientMutationId: input.clientMutationId,
            data: rows,
          };
        }

        newFields = extend(
          newFields,
          {
            [fieldName]: newFieldWithHooks,
          },
          `Adding update mutation for ${describePgEntity(constraint)}`
        );
      });
    }

    return extend(
      fields,
      newFields,
      `Adding the many 'update' mutation to the root mutation`
    );
  }
};
export default PostGraphileManyUpdatePlugin;
