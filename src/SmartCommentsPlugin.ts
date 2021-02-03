import { Plugin } from "postgraphile";
import { MultipleMutationsPluginOptions } from "./pluginTypes";

const putSmartCommentOnTable = (
  commentName: string,
  commentText: string,
  table: Record<string, any>
) => {
  if (table.isSelectable && table.namespace && !table.tags[commentName]) {
    table.tags[commentName] = `\n ${commentText}`;
  }
};

const isTableModifiable = (
  tableName: string,
  areMutationsDisabled: boolean,
  ignoredTables: Array<string>
) =>
  areMutationsDisabled
    ? ignoredTables.includes(tableName)
    : !ignoredTables.includes(tableName);

const SmartCommentsPlugin: Plugin = (builder, options) => {
  builder.hook("build", (build) => {
    const { pgIntrospectionResultsByKind } = build;
    const pluginOptions: MultipleMutationsPluginOptions =
      options.multipleMutationsPluginOptions;

    const isDisabled = pluginOptions?.enabled === false;
    const isIgnoreProvided = !!pluginOptions?.ignore?.length;
    if (isDisabled && !isIgnoreProvided) {
      return build;
    }

    pgIntrospectionResultsByKind.class.forEach((table: Record<string, any>) => {
      isTableModifiable(table.name, isDisabled, pluginOptions?.ignore || []) &&
        putSmartCommentOnTable(
          "mncud",
          "The table is available for multiple mutations postgraphile plugin.",
          table
        );
    });

    return build;
  });
};

export default SmartCommentsPlugin;
