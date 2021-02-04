import * as T from "./pluginTypes";

// TODO move all namings here
const PostgraphileManyInflectionPlugin: T.Plugin = (builder) => {
  builder.hook("inflection", (inflection, build) =>
    build.extend(inflection, {
      _makeManyFieldNameWithConstraints({
        detailedKeys,
        action,
        constraintType,
        tableName,
      }: {
        detailedKeys: string[];
        tableName: string;
        constraintType: string;
        action: string;
      }) {
        const pluralTableName = this.pluralize(tableName);
        if (constraintType === "p") {
          return this.camelCase(`${action}-${pluralTableName}`);
        } else {
          return this.camelCase(
            `${action}-${pluralTableName}-by-${detailedKeys
              .map((key) => this.column(key))
              .join("-and-")}`
          );
        }
      },

      updateManyByKeys(detailedKeys, table, constraint) {
        // respect pg-simplify-inflector plugin
        if (constraint.tags.updateFieldName) {
          return constraint.tags.updateFieldName;
        }
        return this._makeManyFieldNameWithConstraints({
          detailedKeys,
          action: "update",
          constraintType: constraint.type,
          tableName: this._singularizedTableName(table),
        });
      },
      deleteManyByKeys(detailedKeys, table, constraint) {
        // respect pg-simplify-inflector plugin
        if (constraint.tags.deleteFieldName) {
          return constraint.tags.deleteFieldName;
        }
        return this._makeManyFieldNameWithConstraints({
          detailedKeys,
          action: "delete",
          constraintType: constraint.type,
          tableName: this._singularizedTableName(table),
        });
      },
    })
  );
};

export default PostgraphileManyInflectionPlugin;
